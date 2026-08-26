# Massive Primary Data Provider Design

## Objective

Replace Financial Modeling Prep (FMP) with a Massive/Polygon-compatible market-data service as RegimeAlpha's sole runtime and build-time provider while preserving the existing generated-data and frontend contracts.

## Scope

This change covers historical daily aggregates used by `scripts/build-regimes.mjs`, live quotes and intraday aggregates used by `functions/api/pulse.js`, provider configuration, validation, tests, and deployment documentation. It does not redesign the regime classifier, dashboard, exported JSON schema, MCP tools, or user-facing layouts.

## Architecture

Create focused Massive provider modules rather than editing an installed Massive client package:

- A pure shared `resolveMassiveConfig(source)` module accepts a plain key/value source. The Node entry point passes `process.env`; the Pages Function passes its Cloudflare `env` binding. This keeps runtime-specific globals out of the shared module and makes configuration directly unit-testable.
- A build-time client retrieves Polygon-compatible aggregate bars and normalizes them into the existing daily row shape.
- A Pages-compatible client retrieves snapshots/quotes and five-minute aggregate bars, then normalizes them into the shape already consumed by Pulse.
- Existing classifier and UI code remain provider-agnostic.

The REST origin is fixed to `https://api.massiveprivateserver.site`. `MASSIVE_WS_URL` is optional because persistent streaming is outside this change; when present, it must use `wss://socket.massiveprivateserver.site`. Plain-HTTP/WS and alternate origins are rejected so credentials cannot be downgraded or sent to another host.

## Configuration and Secret Handling

Configuration contract:

- `MASSIVE_API_KEY`: secret credential; never logged, returned in errors, committed, or embedded in generated output.
- `MASSIVE_BASE_URL`: optional only when equal to the required private HTTPS origin; otherwise configuration fails closed.
- `MASSIVE_WS_URL`: optional WebSocket origin retained for documented future streaming use; when set, it must use the required private WSS origin.

The local credential belongs in ignored `.env.local`. Cloudflare receives it as a Worker secret. Documentation uses placeholders only.

## Data Flow

### Historical regime build

1. Resolve and validate provider configuration.
2. Request `/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}` with adjusted, ascending results.
3. Follow `next_url` pagination only after resolving it against the configured base and verifying the same origin and approved protocol on every page. Cap pagination at 100 pages. Prefer an `Authorization: Bearer` header when supported; otherwise append the key only after origin validation. Never copy an authenticated URL into errors or logs.
4. Normalize Polygon fields (`t`, `o`, `h`, `l`, `c`, `v`) to RegimeAlpha daily rows.
5. Preserve the SQLite caching and incremental rebuild behavior.
6. Emit the existing `data/regimes.json` and `public/data/regimes.json` contracts with provider metadata updated to Massive.

### Pulse

1. Request `/v2/snapshot/locale/us/markets/stocks/tickers` in bounded batches for US stocks/ETFs and the mapped snapshot/previous-close endpoints for index, crypto, and international instruments.
2. Derive the existing Pulse fields from snapshot `day`, `prevDay`, `lastTrade`, and ticker metadata: price, change, change percentage, previous close, day high/low, volume, timestamp, exchange, and canonical symbol. A last-trade-only response is insufficient and is never treated as a full quote.
3. Request `/v2/aggs/ticker/{ticker}/range/5/minute/{from}/{to}` for chart symbols, using New York session boundaries for US instruments and the mapped exchange timezone for international instruments.
4. Use concurrency 4, preserve requested canonical ordering, and mark optional missing symbols as unavailable without shifting fields. Missing `SPY`, `QQQ`, `IWM`, `SOXX`, `TLT`, or VIX is fatal when no stale Pulse cache exists.
5. Normalize responses to the existing quote and chart models.
6. Reuse the existing pressure, signal, cache, and stale-response behavior.

WebSocket configuration is documented and validated, but persistent streaming is not added to the serverless Pages Function in this change because the current request/response Pulse architecture does not maintain durable connections.

## Symbol Compatibility

US stocks and ETFs pass through unchanged, including every sector/industry proxy and `DRAM`. A single explicit mapping table covers all exceptions currently used by the repository: VIX to Massive's index namespace, `BTCUSD` to its crypto namespace, `^KS11` to KOSPI, `^N225` to Nikkei 225, `^NDX` to Nasdaq 100, and `000660.KS`/`005930.KS` to their Korean listing identifiers. Each exceptional mapping requires an authenticated, redacted live metadata or aggregate smoke check against the configured service and deployed plan. If that check is deliberately skipped or the plan lacks entitlement, the instrument is treated as unavailable rather than claimed as supported.

Historical builds treat `SPY`, VIX, `TLT`, `QQQ`, and `IWM` as required primary series. Each required series must contain at least 252 valid trading-day rows, begin no later than 14 calendar days after the requested fetch start, and end within seven calendar days of the requested end. Every retained row must have a valid timestamp, finite positive OHLC values, `high >= max(open, close)`, `low <= min(open, close)`, and non-negative volume. Violations fail with a ticker-specific coverage error before classification.

Other asset proxies are optional only when the output records an explicit unavailable reason; the build may not silently reuse stale FMP data. A backward-compatible `metadata.unavailableSymbols` array records objects shaped as `{ symbol, providerSymbol, reason }`, while unavailable optional instruments are omitted from `assetRegimes` and `assetWeekCandles`. Existing consumers remain valid because all current fields retain their shape. Add a contract test with one unavailable optional proxy. If the Massive plan cannot supply KOSPI, Nikkei, or Korean listings, they use this representation rather than an unrelated substitute.

## Cache Migration

Replace the FMP-specific cache namespace with a provider cache keyed by `massive`, normalized REST origin, schema version, canonical symbol, provider symbol, date range, and endpoint. Legacy `fmp_cache` rows are ignored and never migrated into Massive results. `REGIME_REFRESH=1` bypasses Massive response cache; incremental mode may reuse only Massive-namespaced rows and the prior generated regime payload, while still requiring Massive data for the replaced tail window.

## Error Handling

- Reject missing keys and unsafe plaintext origins before any request.
- Use a 15-second timeout per REST request and at most three attempts. Retry network failures, 408, 429, and 5xx responses with capped exponential backoff; honor `Retry-After` up to 30 seconds. Do not retry other 4xx responses.
- Limit concurrent REST requests to four, cap pagination at 100 pages, and cap inspected error bodies at 1 KiB.
- Include provider status and ticker in errors, but redact query strings and credentials.
- Validate response status and schema before normalization.
- Preserve cached/stale Pulse data when live refresh fails, and pass every surfaced error through the same credential and URL-query redactor.
- Fail a historical build if required primary proxies are missing or insufficient.

## Testing and Verification

Add deterministic tests using mocked Massive responses for:

- configuration validation and the insecure-transport gate;
- aggregate pagination and normalization;
- symbol mapping;
- quote and intraday normalization;
- credential redaction from errors;
- unchanged regime-output and Pulse contracts;
- Pulse HIT, MISS, STALE, missing-key, and no-cache failure paths;
- same-origin pagination, unsafe protocol rejection, retry bounds, and partial-symbol handling.

Run `npm test` and `npm run build:static`. Search runtime, build, workflow, and documentation surfaces to ensure no active FMP endpoint or `FMP_API_KEY` references remain. Verify both `.github/workflows/daily-data-refresh.yml` and `.github/workflows/update-regime-kv.yml` use the Massive secret/config, and update README plus Cloudflare deployment instructions. A live smoke test may use the emailed proxy only from local secret configuration with the explicit insecure-transport opt-in; test output must not print the key. Generated files must contain neither credentials nor authenticated proxy query strings.

The public JSON structure receives one backward-compatible extension: optional `metadata.unavailableSymbols`. Existing `metadata.source.endpoint` and `metadata.source.docs` values change to Massive equivalents, and FMP-specific proxy notes are rewritten as provider-neutral mapping notes. No existing fields are removed or reshaped.

## Delivery

Implementation will be developed on a feature branch, committed, pushed to `chenzixin1/RegimeAlpha`, and proposed through a pull request. The default branch remains untouched until the user reviews or merges the PR.
