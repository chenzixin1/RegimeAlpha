const SNAPSHOT_CHUNK_BYTES = 480_000;
const STATEMENT_BATCH_SIZE = 40;

export function validateRegimePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Payload must be a JSON object.");
  if (!payload.metadata?.dataThrough || !payload.metadata?.requestedEnd || !payload.metadata?.generatedAt) {
    throw new Error("Payload metadata.dataThrough, metadata.requestedEnd, and metadata.generatedAt are required.");
  }
  if (!isIsoDate(payload.metadata.dataThrough)
    || !isIsoDate(payload.metadata.requestedEnd)
    || payload.metadata.dataThrough > payload.metadata.requestedEnd
    || !isIsoTimestamp(payload.metadata.generatedAt)) {
    throw new Error("Payload metadata dates are invalid.");
  }
  if (!Array.isArray(payload.regimes) || !payload.regimes.length) {
    throw new Error("Payload regimes must be a non-empty array.");
  }
  if (payload.regimes.length > 400 || !hasStrictWeeklyOrder(payload.regimes)) {
    throw new Error("Payload regimes exceed limits or are not strictly ordered.");
  }
  if (!Array.isArray(payload.assetRegimes) || payload.assetRegimes.length > 100) {
    throw new Error("Payload assetRegimes must be an array.");
  }
  const symbols = new Set();
  for (const asset of payload.assetRegimes) {
    if (!/^[A-Z0-9.^-]{1,20}$/.test(String(asset.symbol || ""))
      || symbols.has(asset.symbol)
      || !Array.isArray(asset.regimes)
      || asset.regimes.length > 400
      || !hasStrictWeeklyOrder(asset.regimes)) {
      throw new Error("Payload assetRegimes contain invalid or duplicate rows.");
    }
    symbols.add(asset.symbol);
  }
  if (!payload.summary?.latest?.weekEnd) {
    throw new Error("Payload summary.latest is required.");
  }
  if (payload.summary.latest.weekEnd !== payload.metadata.dataThrough
    || payload.regimes.at(-1)?.weekEnd !== payload.metadata.dataThrough) {
    throw new Error("Payload latest week must match metadata.dataThrough.");
  }
  return payload;
}

export function snapshotIdFor(payload, runId) {
  const suffix = String(runId || crypto.randomUUID()).replace(/[^0-9A-Za-z]/g, "").slice(0, 24);
  return `${payload.metadata.dataThrough}-${suffix}`;
}

export function chunkUtf8(text, maxBytes = SNAPSHOT_CHUNK_BYTES) {
  const encoder = new TextEncoder();
  const chunks = [];
  let start = 0;
  let bytes = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    const characterBytes = encoder.encode(character).byteLength;
    if (bytes && bytes + characterBytes > maxBytes) {
      chunks.push(text.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += characterBytes;
    if (codePoint > 0xffff) index += 1;
  }

  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}

export async function publishIncrementalSnapshot(db, payload, candles, { runId, sourceSnapshot } = {}) {
  validateRegimePayload(payload);
  if (!runId || !sourceSnapshot?.id) throw new Error("A run id and source snapshot are required.");

  const snapshotId = snapshotIdFor(payload, runId);
  const now = new Date().toISOString();
  const replaceFrom = payload.regimes[0].weekEnd;
  const retentionStart = subtractYears(payload.metadata.requestedEnd, 5);
  const metadata = { ...payload.metadata, requestedStart: retentionStart };
  const assetRows = payload.assetRegimes.flatMap((asset) => (asset.regimes || []).map((row) => [
    snapshotId, asset.symbol, row.weekEnd, row.weekStart, row.code, row.label, row.labelZh,
    Number(row.confidence || 0), JSON.stringify(row)
  ]));

  try {
    await db.prepare(
      `INSERT INTO snapshots
        (id, data_through, generated_at, requested_start, requested_end, chunk_count, byte_count, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
    ).bind(
      snapshotId,
      metadata.dataThrough,
      metadata.generatedAt,
      retentionStart,
      metadata.requestedEnd || null,
      now
    ).run();

    await db.batch([
      db.prepare(
        `INSERT INTO market_regimes
          (snapshot_id, week_end, week_start, code, label, label_zh, confidence, row_json)
         SELECT ?, week_end, week_start, code, label, label_zh, confidence, row_json
         FROM market_regimes
         WHERE snapshot_id = ? AND week_end >= ? AND week_end < ?`
      ).bind(snapshotId, sourceSnapshot.id, retentionStart, replaceFrom),
      db.prepare(
        `INSERT INTO assets
          (snapshot_id, symbol, display_symbol, name, group_name, proxy_note, asset_json)
         SELECT ?, symbol, display_symbol, name, group_name, proxy_note, asset_json
         FROM assets WHERE snapshot_id = ?`
      ).bind(snapshotId, sourceSnapshot.id),
      db.prepare(
        `INSERT INTO asset_weekly_regimes
          (snapshot_id, symbol, week_end, week_start, code, label, label_zh, confidence, row_json)
         SELECT ?, symbol, week_end, week_start, code, label, label_zh, confidence, row_json
         FROM asset_weekly_regimes
         WHERE snapshot_id = ? AND week_end >= ? AND week_end < ?`
      ).bind(snapshotId, sourceSnapshot.id, retentionStart, replaceFrom)
    ]);

    const statements = [
      ...buildUpserts(db, {
        table: "market_regimes",
        columns: ["snapshot_id", "week_end", "week_start", "code", "label", "label_zh", "confidence", "row_json"],
        rows: payload.regimes.map((row) => [
          snapshotId, row.weekEnd, row.weekStart, row.code, row.label, row.labelZh,
          Number(row.confidence || 0), JSON.stringify(row)
        ]),
        conflict: "snapshot_id, week_end",
        update: ["week_start", "code", "label", "label_zh", "confidence", "row_json"]
      }),
      ...buildUpserts(db, {
        table: "assets",
        columns: ["snapshot_id", "symbol", "display_symbol", "name", "group_name", "proxy_note", "asset_json"],
        rows: payload.assetRegimes.map((asset) => {
          const { regimes: _regimes, ...assetMetadata } = asset;
          return [
            snapshotId, asset.symbol, asset.displaySymbol || asset.symbol, asset.name || asset.symbol,
            asset.group || "Other", asset.proxyNote || null, JSON.stringify(assetMetadata)
          ];
        }),
        conflict: "snapshot_id, symbol",
        update: ["display_symbol", "name", "group_name", "proxy_note", "asset_json"]
      }),
      ...buildUpserts(db, {
        table: "asset_weekly_regimes",
        columns: ["snapshot_id", "symbol", "week_end", "week_start", "code", "label", "label_zh", "confidence", "row_json"],
        rows: assetRows,
        conflict: "snapshot_id, symbol, week_end",
        update: ["week_start", "code", "label", "label_zh", "confidence", "row_json"]
      })
    ];
    await runStatements(db, statements);
    await publishPreviewCandles(db, snapshotId, candles);

    const summary = await buildSnapshotSummary(db, snapshotId, payload.regimeDefinitions || {});
    const sections = {
      metadata,
      summary,
      regimeDefinitions: payload.regimeDefinitions || {},
      strategyMap: payload.strategyMap || {}
    };
    await runStatements(db, buildUpserts(db, {
      table: "snapshot_sections",
      columns: ["snapshot_id", "section_key", "section_json"],
      rows: Object.entries(sections).map(([key, value]) => [snapshotId, key, JSON.stringify(value)]),
      conflict: "snapshot_id, section_key",
      update: ["section_json"]
    }));

    const compatibility = await writeCompatibilityChunks(db, snapshotId, sections);
    await db.prepare(
      "UPDATE snapshots SET chunk_count = ?, byte_count = ? WHERE id = ?"
    ).bind(compatibility.chunkCount, compatibility.byteCount, snapshotId).run();
    await activateSnapshot(db, snapshotId, metadata, now);
    await db.prepare(
      `UPDATE update_runs SET status = 'succeeded', finished_at = ?, data_through = ?, generated_at = ?, error = NULL
       WHERE id = ? AND status IN ('queued', 'running')`
    ).bind(now, metadata.dataThrough, metadata.generatedAt, runId).run();

    return {
      ok: true,
      snapshotId,
      dataThrough: metadata.dataThrough,
      generatedAt: metadata.generatedAt,
      byteCount: compatibility.byteCount,
      chunks: compatibility.chunkCount,
      marketWeeks: summary.weeks,
      assetWeeks: await countRows(db, "asset_weekly_regimes", snapshotId)
    };
  } catch (error) {
    if ((await activeSnapshot(db))?.id !== snapshotId) await discardSnapshot(db, snapshotId);
    throw error;
  }
}

export async function publishPreviewCandles(db, snapshotId, candles) {
  if (!snapshotId || !candles?.weekEnd || !candles?.candles) {
    throw new Error("snapshotId and a valid candle payload are required.");
  }
  await db.prepare(
    `INSERT INTO preview_candles (snapshot_id, week_end, candles_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(snapshot_id) DO UPDATE SET
       week_end = excluded.week_end, candles_json = excluded.candles_json, created_at = excluded.created_at`
  ).bind(snapshotId, candles.weekEnd, JSON.stringify(candles), new Date().toISOString()).run();
}

async function buildSnapshotSummary(db, snapshotId, regimeDefinitions) {
  const [stats, latestRow, assetRows] = await Promise.all([
    db.prepare(
      `SELECT code, MIN(label) AS label, MIN(label_zh) AS label_zh, COUNT(*) AS count,
              AVG(CAST(json_extract(row_json, '$.metrics.weeklyReturn') AS REAL)) AS avg_weekly_return,
              AVG(CAST(json_extract(row_json, '$.metrics.realizedVol20') AS REAL)) AS avg_vol
       FROM market_regimes WHERE snapshot_id = ? GROUP BY code`
    ).bind(snapshotId).all(),
    db.prepare(
      "SELECT row_json FROM market_regimes WHERE snapshot_id = ? ORDER BY week_end DESC LIMIT 1"
    ).bind(snapshotId).first(),
    db.prepare(
      `SELECT a.asset_json, r.row_json
       FROM assets a
       JOIN asset_weekly_regimes r
         ON r.snapshot_id = a.snapshot_id AND r.symbol = a.symbol
        AND r.week_end = (
          SELECT MAX(latest.week_end) FROM asset_weekly_regimes latest
          WHERE latest.snapshot_id = a.snapshot_id AND latest.symbol = a.symbol
        )
       WHERE a.snapshot_id = ? ORDER BY a.symbol`
    ).bind(snapshotId).all()
  ]);
  const latestMarket = parseStoredJson(latestRow?.row_json);
  if (!latestMarket) throw new Error("The new snapshot has no market rows.");
  const orderFor = (code) => Number(regimeDefinitions?.[code]?.order ?? 999);
  const byRegime = (stats.results || []).map((row) => ({
    code: row.code,
    label: row.label,
    labelZh: row.label_zh,
    count: Number(row.count),
    avgWeeklyReturn: round(Number(row.avg_weekly_return || 0), 5),
    avgVol: round(Number(row.avg_vol || 0), 4)
  })).sort((a, b) => orderFor(a.code) - orderFor(b.code));
  const latestAssets = (assetRows.results || []).map((row) => {
    const asset = parseStoredJson(row.asset_json);
    const regime = parseStoredJson(row.row_json);
    return {
      symbol: asset.symbol,
      displaySymbol: asset.displaySymbol,
      name: asset.name,
      group: asset.group,
      code: regime.code,
      label: regime.label,
      labelZh: regime.labelZh,
      confidence: regime.confidence,
      weeklyReturn: regime.metrics?.weeklyReturn,
      ret13w: regime.metrics?.ret13w,
      relativeToSpy13w: regime.metrics?.relativeToSpy13w,
      realizedVol20: regime.metrics?.realizedVol20,
      divergentFromMarket: regime.code !== latestMarket.code
    };
  });
  const byLatestRegime = [];
  for (const asset of latestAssets) {
    let group = byLatestRegime.find((item) => item.code === asset.code);
    if (!group) {
      group = { code: asset.code, label: asset.label, labelZh: asset.labelZh, count: 0 };
      byLatestRegime.push(group);
    }
    group.count += 1;
  }
  byLatestRegime.sort((a, b) => orderFor(a.code) - orderFor(b.code));

  return {
    weeks: await countRows(db, "market_regimes", snapshotId),
    latest: latestMarket,
    byRegime,
    assets: {
      count: latestAssets.length,
      latest: latestAssets,
      byLatestRegime,
      divergences: latestAssets
        .filter((item) => item.divergentFromMarket && item.symbol !== "SPY")
        .sort((a, b) => Math.abs(b.relativeToSpy13w || 0) - Math.abs(a.relativeToSpy13w || 0))
        .slice(0, 8)
    }
  };
}

async function writeCompatibilityChunks(db, snapshotId, sections) {
  const writer = new SnapshotChunkWriter(db, snapshotId);
  const assets = await db.prepare(
    "SELECT symbol, asset_json FROM assets WHERE snapshot_id = ? ORDER BY symbol"
  ).bind(snapshotId).all();

  await writer.append(`{"metadata":${JSON.stringify(sections.metadata)},"assets":[`);
  for (let index = 0; index < (assets.results || []).length; index += 1) {
    if (index) await writer.append(",");
    await writer.append(assets.results[index].asset_json);
  }
  await writer.append(`],"assetRegimes":[`);
  for (let index = 0; index < (assets.results || []).length; index += 1) {
    const asset = assets.results[index];
    if (index) await writer.append(",");
    const metadata = String(asset.asset_json || "");
    if (!metadata.startsWith("{") || !metadata.endsWith("}")) throw new Error("Invalid stored asset metadata.");
    await writer.append(`${metadata.slice(0, -1)},"regimes":[`);
    await appendPagedRows(writer, db, {
      sql: `SELECT week_end, row_json FROM asset_weekly_regimes
            WHERE snapshot_id = ? AND symbol = ? AND week_end > ?
            ORDER BY week_end LIMIT 50`,
      bindings: [snapshotId, asset.symbol]
    });
    await writer.append("]}");
  }
  await writer.append(`],"regimes":[`);
  await appendPagedRows(writer, db, {
    sql: `SELECT week_end, row_json FROM market_regimes
          WHERE snapshot_id = ? AND week_end > ? ORDER BY week_end LIMIT 50`,
    bindings: [snapshotId]
  });
  await writer.append(`],"regimeDefinitions":${JSON.stringify(sections.regimeDefinitions)}`);
  await writer.append(`,"strategyMap":${JSON.stringify(sections.strategyMap)}`);
  await writer.append(`,"summary":${JSON.stringify(sections.summary)}}`);
  return writer.finish();
}

async function appendPagedRows(writer, db, { sql, bindings }) {
  let cursor = "";
  let first = true;
  while (true) {
    const page = await db.prepare(sql).bind(...bindings, cursor).all();
    const rows = page.results || [];
    for (const row of rows) {
      if (!first) await writer.append(",");
      await writer.append(row.row_json);
      first = false;
      cursor = row.week_end;
    }
    if (rows.length < 50) break;
  }
}

class SnapshotChunkWriter {
  constructor(db, snapshotId) {
    this.db = db;
    this.snapshotId = snapshotId;
    this.encoder = new TextEncoder();
    this.buffer = "";
    this.bufferBytes = 0;
    this.byteCount = 0;
    this.chunkCount = 0;
  }

  async append(value) {
    const text = String(value);
    const textBytes = this.encoder.encode(text).byteLength;
    this.byteCount += textBytes;
    if (this.bufferBytes && this.bufferBytes + textBytes > SNAPSHOT_CHUNK_BYTES) await this.flush();
    if (textBytes <= SNAPSHOT_CHUNK_BYTES) {
      this.buffer += text;
      this.bufferBytes += textBytes;
      return;
    }
    for (const part of chunkUtf8(text)) {
      const partBytes = this.encoder.encode(part).byteLength;
      if (this.bufferBytes && this.bufferBytes + partBytes > SNAPSHOT_CHUNK_BYTES) await this.flush();
      this.buffer += part;
      this.bufferBytes += partBytes;
      if (this.bufferBytes >= SNAPSHOT_CHUNK_BYTES) await this.flush();
    }
  }

  async flush() {
    if (!this.buffer) return;
    await this.db.prepare(
      "INSERT INTO snapshot_chunks (snapshot_id, chunk_index, chunk_text) VALUES (?, ?, ?)"
    ).bind(this.snapshotId, this.chunkCount, this.buffer).run();
    this.chunkCount += 1;
    this.buffer = "";
    this.bufferBytes = 0;
  }

  async finish() {
    await this.flush();
    return { chunkCount: this.chunkCount, byteCount: this.byteCount };
  }
}

async function activateSnapshot(db, snapshotId, metadata, now) {
  const activation = await db.batch([
    db.prepare(
      `UPDATE snapshots SET deactivated_at = ?
       WHERE id = (SELECT snapshot_id FROM active_snapshot WHERE singleton = 1)
         AND id != ? AND deactivated_at IS NULL
         AND EXISTS (
           SELECT 1 FROM snapshots candidate
           WHERE candidate.id = ? AND (
             snapshots.data_through < candidate.data_through OR
             (snapshots.data_through = candidate.data_through
               AND snapshots.generated_at <= candidate.generated_at)
           )
         )`
    ).bind(now, snapshotId, snapshotId),
    db.prepare(
      `INSERT OR IGNORE INTO active_snapshot (singleton, snapshot_id, activated_at)
       VALUES (1, ?, ?)`
    ).bind(snapshotId, now),
    db.prepare(
      `UPDATE active_snapshot SET snapshot_id = ?, activated_at = ?
       WHERE singleton = 1 AND (
         snapshot_id = ? OR EXISTS (
           SELECT 1 FROM snapshots current
           WHERE current.id = active_snapshot.snapshot_id
             AND (
               current.data_through < ? OR
               (current.data_through = ? AND current.generated_at <= ?)
             )
         )
       )`
    ).bind(snapshotId, now, snapshotId, metadata.dataThrough, metadata.dataThrough, metadata.generatedAt)
  ]);
  const changed = activation.some((result) => Number(result.meta?.changes || 0) > 0);
  if (!changed && (await activeSnapshot(db))?.id !== snapshotId) {
    throw new Error("Snapshot is older than the active D1 snapshot.");
  }
}

async function runStatements(db, statements) {
  for (let index = 0; index < statements.length; index += STATEMENT_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + STATEMENT_BATCH_SIZE));
  }
}

async function countRows(db, table, snapshotId) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE snapshot_id = ?`
  ).bind(snapshotId).first();
  return Number(row?.count || 0);
}

function subtractYears(value, years) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new Error("requestedEnd must be an ISO date.");
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function parseStoredJson(value) {
  return value ? JSON.parse(value) : null;
}

function round(value, digits) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function cleanupOldSnapshots(db) {
  const active = await activeSnapshot(db);
  if (!active) return;
  const old = await db.prepare(
    `SELECT id FROM snapshots
     WHERE id != ? AND (
       (deactivated_at IS NOT NULL AND datetime(deactivated_at) < datetime('now', '-2 days')) OR
       (deactivated_at IS NULL AND datetime(created_at) < datetime('now', '-2 days'))
     )
     ORDER BY created_at DESC`
  ).bind(active.id).all();
  for (const row of old.results || []) {
    await discardSnapshot(db, row.id);
  }
}

export async function discardSnapshot(db, snapshotId) {
  await db.prepare("DELETE FROM asset_weekly_regimes WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM assets WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM market_regimes WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM snapshot_sections WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM snapshot_chunks WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM preview_candles WHERE snapshot_id = ?").bind(snapshotId).run();
  await db.prepare("DELETE FROM snapshots WHERE id = ?").bind(snapshotId).run();
}

export async function activeSnapshot(db) {
  return db.prepare(
    `SELECT s.*, a.activated_at
     FROM active_snapshot a JOIN snapshots s ON s.id = a.snapshot_id
     WHERE a.singleton = 1`
  ).first();
}

export function buildUpserts(db, { table, columns, rows, conflict, update }) {
  if (!rows.length) return [];
  const rowsPerStatement = Math.max(1, Math.floor(96 / columns.length));
  const statements = [];
  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const updates = update.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ");

  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const group = rows.slice(offset, offset + rowsPerStatement);
    const placeholders = group.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const sql = `INSERT INTO ${quoteIdentifier(table)} (${quotedColumns}) VALUES ${placeholders}
      ON CONFLICT(${conflict.split(",").map((item) => quoteIdentifier(item.trim())).join(", ")}) DO UPDATE SET ${updates}`;
    statements.push(db.prepare(sql).bind(...group.flat()));
  }
  return statements;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function hasStrictWeeklyOrder(rows) {
  let previous = "";
  for (const row of rows) {
    if (!isIsoDate(row?.weekEnd) || row.weekEnd <= previous) return false;
    previous = row.weekEnd;
  }
  return true;
}
