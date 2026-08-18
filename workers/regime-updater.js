import {
  activeSnapshot,
  cleanupOldSnapshots,
  publishIncrementalSnapshot
} from "./regime-d1-store.js";
import { REQUIRED_MASSIVE_BASE_URL, resolveMassiveConfig } from "../lib/massive-config.js";
import { resolveFmpConfig } from "../lib/fmp-client.js";
import { generateRegimeData } from "../scripts/build-regimes.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (url.pathname === "/data/regimes.json") return serveSnapshot(request, env.REGIME_DB, ctx);
    if (url.pathname === "/data/local-preview-candles.json") return servePreviewCandles(env.REGIME_DB);
    if (url.pathname === "/api/regimes" || url.pathname === "/api/regimes/latest") {
      return serveLatest(env.REGIME_DB);
    }
    if (url.pathname === "/api/regimes/history") return serveMarketHistory(env.REGIME_DB, url);
    if (url.pathname.startsWith("/api/assets/") && url.pathname.endsWith("/regimes")) {
      return serveAssetHistory(env.REGIME_DB, url);
    }
    if (url.pathname === "/api/regime-update/status") return serveStatus(env.REGIME_DB, request, env);

    if (url.pathname === "/api/regime-update/run") {
      if (!isAuthorized(request, env)) return json({ error: "Unauthorized" }, 401);
      if (request.method !== "POST") return json({ error: "POST required" }, 405);
      const result = await runWorkerRefresh(env, "manual");
      return json(result, result.ok ? 200 : result.status || 500);
    }
    if (url.pathname.startsWith("/api/regime-update/")) return json({ error: "Not found" }, 404);

    return json({
      service: "regimealpha-data",
      storage: "Cloudflare D1",
      schedule: "Saturday 00:15 UTC (08:15 Asia/Shanghai)",
      endpoints: [
        "/data/regimes.json",
        "/api/regimes/latest",
        "/api/regimes/history",
        "/api/assets/:symbol/regimes",
        "/api/regime-update/status"
      ]
    });
  },

  async scheduled(controller, env) {
    await runWorkerRefresh(env, `weekly-cron:${controller.cron}`);
  }
};

async function serveSnapshot(request, db, ctx) {
  if (!["GET", "HEAD"].includes(request.method)) return json({ error: "GET required" }, 405);
  const snapshot = await activeSnapshot(db);
  if (!snapshot) return json({ error: "No D1 snapshot has been published yet." }, 503);
  const cache = caches.default;
  const cacheUrl = new URL(`/__regimealpha-cache/snapshots/${snapshot.id}.json`, request.url);
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return request.method === "HEAD"
      ? new Response(null, { status: cached.status, headers: cached.headers })
      : cached;
  }

  const response = createSnapshotResponse(db, snapshot);
  ctx.waitUntil(cache.put(cacheKey, createSnapshotResponse(db, snapshot)));
  if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

function createSnapshotResponse(db, snapshot) {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (index >= snapshot.chunk_count) return controller.close();
        const current = index;
        index += 1;
        const row = await db.prepare(
          "SELECT chunk_text FROM snapshot_chunks WHERE snapshot_id = ? AND chunk_index = ?"
        ).bind(snapshot.id, current).first();
        if (!row?.chunk_text) throw new Error(`Snapshot chunk ${current} is missing.`);
        controller.enqueue(encoder.encode(row.chunk_text));
        if (index >= snapshot.chunk_count) controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
  return new Response(stream, {
    headers: {
      ...JSON_HEADERS,
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      etag: `"${snapshot.id}"`,
      "x-regime-data-through": snapshot.data_through
    }
  });
}

async function servePreviewCandles(db) {
  const snapshot = await activeSnapshot(db);
  if (!snapshot) return json({ error: "No D1 snapshot has been published yet." }, 503);
  const row = await db.prepare(
    "SELECT candles_json FROM preview_candles WHERE snapshot_id = ?"
  ).bind(snapshot.id).first();
  if (!row?.candles_json) return json({ error: "No preview candles are available for the active snapshot." }, 404);
  return new Response(row.candles_json, {
    headers: { ...JSON_HEADERS, "cache-control": "public, max-age=300, stale-while-revalidate=3600" }
  });
}

async function serveLatest(db) {
  const snapshot = await activeSnapshot(db);
  if (!snapshot) return json({ error: "No D1 snapshot has been published yet." }, 503);
  const [metadata, summary, market, assets] = await Promise.all([
    readSection(db, snapshot.id, "metadata"),
    readSection(db, snapshot.id, "summary"),
    db.prepare("SELECT row_json FROM market_regimes WHERE snapshot_id = ? AND week_end = ?")
      .bind(snapshot.id, snapshot.data_through).first(),
    db.prepare(
      `SELECT a.asset_json, r.row_json
       FROM assets a
       LEFT JOIN asset_weekly_regimes r
         ON r.snapshot_id = a.snapshot_id AND r.symbol = a.symbol AND r.week_end = ?
       WHERE a.snapshot_id = ? ORDER BY a.symbol`
    ).bind(snapshot.data_through, snapshot.id).all()
  ]);
  return json({
    metadata,
    summary,
    latest: parseJson(market?.row_json),
    assets: (assets.results || []).map((row) => ({ ...parseJson(row.asset_json), latest: parseJson(row.row_json) }))
  }, 200, "public, max-age=120, stale-while-revalidate=600");
}

async function serveMarketHistory(db, url) {
  const snapshot = await activeSnapshot(db);
  if (!snapshot) return json({ error: "No D1 snapshot has been published yet." }, 503);
  const limit = boundedLimit(url.searchParams.get("limit"), 260, 300);
  const rows = await db.prepare(
    "SELECT row_json FROM market_regimes WHERE snapshot_id = ? ORDER BY week_end DESC LIMIT ?"
  ).bind(snapshot.id, limit).all();
  return json({
    dataThrough: snapshot.data_through,
    regimes: (rows.results || []).map((row) => parseJson(row.row_json)).reverse()
  }, 200, "public, max-age=300, stale-while-revalidate=1800");
}

async function serveAssetHistory(db, url) {
  const snapshot = await activeSnapshot(db);
  if (!snapshot) return json({ error: "No D1 snapshot has been published yet." }, 503);
  const match = url.pathname.match(/^\/api\/assets\/([^/]+)\/regimes$/);
  const symbol = decodeURIComponent(match?.[1] || "").toUpperCase();
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol)) return json({ error: "Invalid symbol" }, 400);
  const limit = boundedLimit(url.searchParams.get("limit"), 260, 300);
  const [asset, rows] = await Promise.all([
    db.prepare("SELECT asset_json FROM assets WHERE snapshot_id = ? AND symbol = ?")
      .bind(snapshot.id, symbol).first(),
    db.prepare(
      "SELECT row_json FROM asset_weekly_regimes WHERE snapshot_id = ? AND symbol = ? ORDER BY week_end DESC LIMIT ?"
    ).bind(snapshot.id, symbol, limit).all()
  ]);
  if (!asset) return json({ error: "Unknown symbol" }, 404);
  return json({
    dataThrough: snapshot.data_through,
    asset: parseJson(asset.asset_json),
    regimes: (rows.results || []).map((row) => parseJson(row.row_json)).reverse()
  }, 200, "public, max-age=300, stale-while-revalidate=1800");
}

async function serveStatus(db, request, env) {
  const [snapshot, run] = await Promise.all([
    activeSnapshot(db),
    db.prepare("SELECT * FROM update_runs ORDER BY started_at DESC LIMIT 1").first()
  ]);
  return json({
    ok: Boolean(snapshot),
    scheduler: "cloudflare-worker-cron",
    schedule: "15 0 * * 6",
    active: snapshot ? {
      snapshotId: snapshot.id,
      dataThrough: snapshot.data_through,
      generatedAt: snapshot.generated_at,
      requestedEnd: snapshot.requested_end,
      bytes: snapshot.byte_count,
      activatedAt: snapshot.activated_at
    } : null,
    latestRun: run ? {
      ...run,
      error: run.error && isAuthorized(request, env) ? run.error : null,
      errorCode: run.error ? "refresh_failed" : null
    } : null
  }, 200, "no-store");
}

async function runWorkerRefresh(env, triggerKind) {
  for (const key of ["MASSIVE_API_KEY", "FMP_API_KEY"]) {
    if (!env[key]) return { ok: false, status: 503, error: `${key} is not configured.` };
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const inserted = await env.REGIME_DB.prepare(
    `INSERT INTO update_runs (id, trigger_kind, status, started_at)
     SELECT ?, ?, 'queued', ?
     WHERE NOT EXISTS (
       SELECT 1 FROM update_runs
       WHERE status IN ('queued', 'running')
         AND datetime(started_at) >= datetime('now', '-30 minutes')
     )`
  ).bind(runId, triggerKind, startedAt).run();
  if (!Number(inserted.meta?.changes || 0)) {
    const recent = await env.REGIME_DB.prepare(
      `SELECT id FROM update_runs
       WHERE status IN ('queued', 'running') AND datetime(started_at) >= datetime('now', '-30 minutes')
       ORDER BY started_at DESC LIMIT 1`
    ).first();
    return { ok: false, status: 409, error: "A refresh is already running.", runId: recent?.id };
  }

  try {
    await env.REGIME_DB.prepare(
      "UPDATE update_runs SET status = 'running' WHERE id = ?"
    ).bind(runId).run();
    const sourceSnapshot = await activeSnapshot(env.REGIME_DB);
    if (!sourceSnapshot) throw new Error("No active D1 snapshot is available for incremental refresh.");
    const massiveConfig = resolveMassiveConfig({
        MASSIVE_API_KEY: env.MASSIVE_API_KEY,
        MASSIVE_BASE_URL: env.MASSIVE_BASE_URL || REQUIRED_MASSIVE_BASE_URL
      });
    if (massiveConfig.baseUrl.origin !== new URL(REQUIRED_MASSIVE_BASE_URL).origin) {
      throw new Error("Massive requests must use the configured private proxy.");
    }
    const { payload, assetWeekCandles } = await generateRegimeData({
      massiveConfig,
      fmpConfig: resolveFmpConfig({ FMP_API_KEY: env.FMP_API_KEY }),
      asOf: new Date().toISOString().slice(0, 10),
      previousDataThrough: sourceSnapshot.data_through,
      incremental: true,
      refresh: true,
      sqliteEnabled: false,
      maxDailyRowsPerSymbol: 750,
      maxTotalDailyRows: 25_000,
      onProgress: (message) => console.log(`[${runId}] ${message}`)
    });
    const result = await publishIncrementalSnapshot(env.REGIME_DB, payload, assetWeekCandles, {
      runId,
      sourceSnapshot
    });
    try {
      await cleanupOldSnapshots(env.REGIME_DB);
    } catch (error) {
      console.warn(`Snapshot cleanup after ${runId} failed`, publicError(error));
    }
    return { ...result, runId };
  } catch (error) {
    await markRunFailed(env.REGIME_DB, runId, error);
    console.error(`Worker-native regime refresh ${runId} failed`, publicError(error));
    return { ok: false, status: 500, runId, error: publicError(error) };
  }
}

async function markRunFailed(db, runId, error) {
  await db.prepare(
    `UPDATE update_runs SET status = 'failed', finished_at = ?, error = ?
     WHERE id = ? AND status IN ('queued', 'running')`
  ).bind(new Date().toISOString(), publicError(error), runId).run();
}

async function readSection(db, snapshotId, key) {
  const row = await db.prepare(
    "SELECT section_json FROM snapshot_sections WHERE snapshot_id = ? AND section_key = ?"
  ).bind(snapshotId, key).first();
  return parseJson(row?.section_json);
}

function isAuthorized(request, env) {
  if (!env.UPDATE_TOKEN) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return constantTimeEqual(bearer, env.UPDATE_TOKEN);
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }
  return difference === 0;
}

function boundedLimit(value, fallback, maximum) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(maximum, parsed)) : fallback;
}

function parseJson(value) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function publicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/([?&](?:apiKey|api_key)=)[^&\s]+/gi, "$1<redacted>").slice(0, 2000);
}

function json(payload, status = 200, cacheControl = "no-store") {
  return Response.json(payload, {
    status,
    headers: { ...JSON_HEADERS, "cache-control": cacheControl }
  });
}
