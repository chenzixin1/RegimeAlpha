# Massive Primary Data Provider Design

## Objective

Replace Financial Modeling Prep (FMP) with a Massive/Polygon-compatible market-data service as RegimeAlpha's sole runtime and build-time provider while preserving the existing generated-data and frontend contracts.

## Scope

This change covers historical daily aggregates used by `scripts/build-regimes.mjs`, live quotes and intraday aggregates used by `functions/api/pulse.js`, provider configuration, validation, tests, and deployment documentation. It does not redesign the regime classifier, dashboard, exported JSON schema, MCP tools, or user-facing layouts.

## Architecture

Create focused Massive provider modules rather than editing an installed Massive client package:

- A shared provider configuration module reads `MASSIVE_API_KEY`, `MASSIVE_BASE_URL`, `MASSIVE_WS_URL`, and `MASSIVE_ALLOW_INSECURE_HTTP`.
- A build-time client retrieves Polygon-compatible aggregate bars and normalizes them into the existing daily row shape.
- A Pages-compatible client retrieves snapshots/quotes and five-minute aggregate bars, then normalizes them into the shape already consumed by Pulse.
- Existing classifier and UI code remain provider-agnostic.

The default base URL should be the official HTTPS Massive endpoint. A custom plain-HTTP or plain-WS endpoint is accepted only when `MASSIVE_ALLOW_INSECURE_HTTP=1` is explicitly set. This prevents accidental credential transmission over plaintext while allowing the user-approved proxy configuration.

## Configuration and Secret Handling

Required environment variables:

- `MASSIVE_API_KEY`: secret credential; never logged, returned in errors, committed, or embedded in generated output.
- `MASSIVE_BASE_URL`: REST origin, configurable for the emailed proxy.
- `MASSIVE_WS_URL`: WebSocket origin for future streaming support and deployment configuration.
- `MASSIVE_ALLOW_INSECURE_HTTP=1`: mandatory when either configured origin uses `http:` or `ws:`.

The local credential belongs in ignored `.env.local`. GitHub Actions and Cloudflare should receive it through repository and deployment secrets. Documentation uses placeholders only.

## Data Flow

### Historical regime build

1. Resolve and validate provider configuration.
2. Request `/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}` with adjusted, ascending results.
3. Follow `next_url` pagination when present, reattaching authentication without exposing it in logs.
4. Normalize Polygon fields (`t`, `o`, `h`, `l`, `c`, `v`) to RegimeAlpha daily rows.
5. Preserve the SQLite caching and incremental rebuild behavior.
6. Emit the existing `data/regimes.json` and `public/data/regimes.json` contracts with provider metadata updated to Massive.

### Pulse

1. Request Massive snapshot or last-trade endpoints for the existing watchlists.
2. Request five-minute aggregates for chart symbols.
3. Normalize responses to the existing quote and chart models.
4. Reuse the existing pressure, signal, cache, and stale-response behavior.

WebSocket configuration is documented and validated, but persistent streaming is not added to the serverless Pages Function in this change because the current request/response Pulse architecture does not maintain durable connections.

## Symbol Compatibility

US stocks and ETFs pass through unchanged. Index, crypto, and international symbols use an explicit mapping table so provider-specific codes do not leak into the classifier. Initial mappings cover VIX, BTC, KOSPI, Nikkei, and Korean listings already present in RegimeAlpha. Unsupported instruments fail with a clear symbol-specific message instead of silently producing incomplete regimes.

## Error Handling

- Reject missing keys and unsafe plaintext origins before any request.
- Apply request timeouts and bounded retries for rate limits and transient 5xx responses.
- Include provider status and ticker in errors, but redact query strings and credentials.
- Validate response status and schema before normalization.
- Preserve cached/stale Pulse data when live refresh fails.
- Fail a historical build if required primary proxies are missing or insufficient.

## Testing and Verification

Add deterministic tests using mocked Massive responses for:

- configuration validation and the insecure-transport gate;
- aggregate pagination and normalization;
- symbol mapping;
- quote and intraday normalization;
- credential redaction from errors;
- unchanged regime-output and Pulse contracts.

Run `npm test` and `npm run build:static`. A live smoke test may use the emailed proxy only from local secret configuration with the explicit insecure-transport opt-in; test output must not print the key.

## Delivery

Implementation will be developed on a feature branch, committed, pushed to `chenzixin1/RegimeAlpha`, and proposed through a pull request. The default branch remains untouched until the user reviews or merges the PR.
