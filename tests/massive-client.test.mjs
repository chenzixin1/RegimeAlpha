import assert from "node:assert/strict";
import test from "node:test";
import { resolveMassiveConfig, redactMassiveSecret } from "../lib/massive-config.js";
import { fetchMassiveAggregates, normalizeMassiveBars, toMassiveSymbol } from "../lib/massive-client.js";

test("requires explicit opt-in for plaintext proxy", () => {
  assert.throws(() => resolveMassiveConfig({ MASSIVE_API_KEY: "secret", MASSIVE_BASE_URL: "http://example.test" }), /Refusing insecure/);
  assert.equal(resolveMassiveConfig({ MASSIVE_API_KEY: "secret", MASSIVE_BASE_URL: "http://example.test", MASSIVE_ALLOW_INSECURE_HTTP: "1" }).baseUrl.origin, "http://example.test");
});

test("maps exceptional symbols", () => {
  assert.equal(toMassiveSymbol("^VIX"), "I:VIX");
  assert.equal(toMassiveSymbol("BTCUSD"), "X:BTCUSD");
  assert.equal(toMassiveSymbol("SPY"), "SPY");
});

test("normalizes aggregate bars", () => {
  const rows = normalizeMassiveBars("SPY", [{ t: Date.UTC(2026, 6, 10), o: 10, h: 12, l: 9, c: 11, v: 100 }]);
  assert.deepEqual(rows[0], { symbol: "SPY", date: "2026-07-10", time: Date.UTC(2026, 6, 10), open: 10, high: 12, low: 9, close: 11, volume: 100, changePercent: 0 });
});

test("blocks cross-origin pagination", async () => {
  const config = resolveMassiveConfig({ MASSIVE_API_KEY: "secret", MASSIVE_BASE_URL: "https://api.example.test" });
  const fetchImpl = async () => new Response(JSON.stringify({ status: "OK", results: [], next_url: "https://evil.test/steal" }), { status: 200 });
  await assert.rejects(fetchMassiveAggregates(config, { symbol: "SPY", from: "2026-01-01", to: "2026-01-02", fetchImpl }), /changed origin/);
});

test("redacts keys and query parameters", () => {
  assert.equal(redactMassiveSecret("failed key-secret?apiKey=key-secret", "key-secret"), "failed <redacted>?apiKey=<redacted>");
});
