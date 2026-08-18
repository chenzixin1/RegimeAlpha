# RegimeAlpha data architecture

RegimeAlpha market data is persisted in Cloudflare D1 and refreshed without a local Codex process or scheduled GitHub Action.

## Production flow

1. Cloudflare Cron runs at `15 0 * * 6`, which is Saturday 08:15 in Asia/Shanghai.
2. The `regimealpha-updater` Worker reads only active snapshot metadata and fetches the incremental Massive/FMP window.
3. The same regime engine used by the local CLI runs as a filesystem-free Worker function.
4. D1 copies the unchanged historical prefix with `INSERT ... SELECT`; the Worker writes only the recalculated tail in bounded batches and streams compatibility JSON into bounded chunks.
5. The Worker switches `active_snapshot` only after all normalized rows and JSON chunks are present.
6. The website reads `/data/regimes.json` from the Worker. The static file in the Pages build remains an initial client-side fallback.

The fixed Saturday schedule naturally handles US market holidays: the generator uses the latest available trading day, so a Thursday close becomes that week's `dataThrough` when Friday is closed.

All Massive REST traffic uses `https://api.massiveprivateserver.site`. Provider keys are Worker secrets, and plaintext HTTP is rejected so credentials are not exposed in transit.

## D1 model

- `update_runs`: scheduler and refresh status.
- `snapshots`: immutable snapshot metadata.
- `snapshot_chunks`: compatibility stream for the existing full JSON client.
- `snapshot_sections`: metadata, summary, definitions, and strategy map.
- `market_regimes`: one normalized row per market week.
- `assets`: one row per tracked asset.
- `asset_weekly_regimes`: one normalized row per asset and week.
- `preview_candles`: current weekly candle strips.

Rows are written under a new run-scoped `snapshot_id`. `active_snapshot` changes last, preventing readers from observing a partially imported dataset. Replaced snapshots are retained for two days from `deactivated_at` so in-flight readers can finish before cleanup; failed partial snapshots are removed two days after creation.

## Public endpoints

- `GET /data/regimes.json`: full compatibility snapshot streamed from D1.
- `GET /data/local-preview-candles.json`: current candle strips.
- `GET /api/regimes/latest`: latest market and asset state.
- `GET /api/regimes/history?limit=260`: market regime history.
- `GET /api/assets/:symbol/regimes?limit=260`: one asset's regime history.
- `GET /api/regime-update/status`: active snapshot and most recent refresh status.

Mutation endpoints require a bearer token. Provider and update tokens remain Worker secrets and are never returned to the client.

## Recovery

An operator can trigger the same bounded-memory refresh with `POST /api/regime-update/run` and the Worker bearer token. There is no market-data GitHub workflow. The checked-in JSON remains a seed for first deployment and a static frontend fallback; routine market-data updates do not commit generated files or redeploy Pages.

To bootstrap a new, empty D1 database outside the Time Travel recovery window, apply migrations and run `npm run d1:seed:sql`. Inspect the numbered files in `.cache/regimealpha-d1-seed/`, then import every file in lexical order with `wrangler d1 execute regimealpha-production --remote --file <part> --config wrangler.regime-updater.jsonc`. Each part is smaller than 1.8 MB, and the active pointer is written only by the final part. This is an operator-only local recovery procedure and exposes no public import endpoint.
