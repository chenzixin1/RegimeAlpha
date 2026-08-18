import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkUtf8, validateRegimePayload } from "../workers/regime-d1-store.js";

export async function createD1SeedSql({
  dataPath = "data/regimes.json",
  candlesPath = "public/local-preview-candles.json",
  outputDir = ".cache/regimealpha-d1-seed"
} = {}) {
  const payload = validateRegimePayload(JSON.parse(await readFile(dataPath, "utf8")));
  const candles = JSON.parse(await readFile(candlesPath, "utf8"));
  const compact = JSON.stringify(payload);
  const digest = createHash("sha256").update(compact).digest("hex");
  const snapshotId = `${payload.metadata.dataThrough}-seed${digest.slice(0, 20)}`;
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const chunks = chunkUtf8(compact, 80_000);
  const statements = [
    "-- RegimeAlpha empty-D1 bootstrap. Apply migrations before importing this file.",
    "-- Import every numbered file in order; active_snapshot is written only in the final file."
  ];

  statements.push(insertSql("update_runs", [
    "id", "trigger_kind", "status", "requested_end", "data_through", "generated_at", "started_at", "finished_at"
  ], [[
    runId, "operator-seed", "succeeded", payload.metadata.requestedEnd || null,
    payload.metadata.dataThrough, payload.metadata.generatedAt, createdAt, createdAt
  ]]));
  statements.push(insertSql("snapshots", [
    "id", "data_through", "generated_at", "requested_start", "requested_end",
    "chunk_count", "byte_count", "created_at"
  ], [[
    snapshotId, payload.metadata.dataThrough, payload.metadata.generatedAt,
    payload.metadata.requestedStart || null, payload.metadata.requestedEnd || null,
    chunks.length, new TextEncoder().encode(compact).byteLength, createdAt
  ]]));
  statements.push(...batchedInsertSql("snapshot_chunks", ["snapshot_id", "chunk_index", "chunk_text"],
    chunks.map((chunk, index) => [snapshotId, index, chunk]), 1));

  const sections = {
    metadata: payload.metadata,
    summary: payload.summary,
    regimeDefinitions: payload.regimeDefinitions || {},
    strategyMap: payload.strategyMap || {}
  };
  statements.push(insertSql("snapshot_sections", ["snapshot_id", "section_key", "section_json"],
    Object.entries(sections).map(([key, value]) => [snapshotId, key, JSON.stringify(value)])));
  statements.push(...batchedInsertSql("market_regimes", [
    "snapshot_id", "week_end", "week_start", "code", "label", "label_zh", "confidence", "row_json"
  ], payload.regimes.map((row) => [
    snapshotId, row.weekEnd, row.weekStart, row.code, row.label, row.labelZh,
    Number(row.confidence || 0), JSON.stringify(row)
  ])));
  statements.push(...batchedInsertSql("assets", [
    "snapshot_id", "symbol", "display_symbol", "name", "group_name", "proxy_note", "asset_json"
  ], payload.assetRegimes.map((asset) => {
    const { regimes: _regimes, ...metadata } = asset;
    return [
      snapshotId, asset.symbol, asset.displaySymbol || asset.symbol, asset.name || asset.symbol,
      asset.group || "Other", asset.proxyNote || null, JSON.stringify(metadata)
    ];
  })));
  statements.push(...batchedInsertSql("asset_weekly_regimes", [
    "snapshot_id", "symbol", "week_end", "week_start", "code", "label", "label_zh", "confidence", "row_json"
  ], payload.assetRegimes.flatMap((asset) => (asset.regimes || []).map((row) => [
    snapshotId, asset.symbol, row.weekEnd, row.weekStart, row.code, row.label, row.labelZh,
    Number(row.confidence || 0), JSON.stringify(row)
  ]))));
  statements.push(insertSql("preview_candles", ["snapshot_id", "week_end", "candles_json", "created_at"], [[
    snapshotId, candles.weekEnd, JSON.stringify(candles), createdAt
  ]]));
  statements.push(insertSql("active_snapshot", ["singleton", "snapshot_id", "activated_at"], [[
    1, snapshotId, createdAt
  ]]));

  const files = await writeSqlParts(outputDir, statements.filter(Boolean));
  return { outputDir, files: files.length, snapshotId, chunks: chunks.length, marketWeeks: payload.regimes.length };
}

async function writeSqlParts(outputDir, statements, maxBytes = 1_800_000, maxStatementBytes = 95_000) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const encoder = new TextEncoder();
  const parts = [];
  let current = [];
  let currentBytes = 0;
  for (const statement of statements) {
    const bytes = encoder.encode(`${statement}\n`).byteLength;
    if (bytes > maxStatementBytes) throw new Error("A seed SQL statement exceeds the SQLite safety limit.");
    if (current.length && currentBytes + bytes > maxBytes) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(statement);
    currentBytes += bytes;
  }
  if (current.length) parts.push(current);

  const files = [];
  for (let index = 0; index < parts.length; index += 1) {
    const file = join(outputDir, `${String(index + 1).padStart(3, "0")}-seed.sql`);
    await writeFile(file, `PRAGMA foreign_keys = ON;\n${parts[index].join("\n")}\n`);
    files.push(file);
  }
  return files;
}

function batchedInsertSql(table, columns, rows, batchSize = 5) {
  const statements = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    statements.push(insertSql(table, columns, rows.slice(index, index + batchSize)));
  }
  return statements;
}

function insertSql(table, columns, rows) {
  if (!rows.length) return "";
  const identifiers = [table, ...columns];
  if (identifiers.some((value) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))) {
    throw new Error("Unsafe SQL identifier in seed generator.");
  }
  const values = rows.map((row) => `(${row.map(sqlLiteral).join(", ")})`).join(",\n");
  return `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES\n${values};`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in seed payload.");
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createD1SeedSql()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
