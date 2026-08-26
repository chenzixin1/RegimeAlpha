import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_MASSIVE_BASE_URL, resolveMassiveConfig, redactMassiveSecret } from "../lib/massive-config.js";
import { fetchMassiveAggregates, normalizeMassiveBars, toMassiveSymbol } from "../lib/massive-client.js";

test("pins Massive requests to the encrypted private proxy", () => {
  assert.equal(resolveMassiveConfig({ MASSIVE_API_KEY: "secret" }).baseUrl.origin, REQUIRED_MASSIVE_BASE_URL);
  assert.throws(() => resolveMassiveConfig({ MASSIVE_API_KEY: "secret", MASSIVE_BASE_URL: "http://api.massiveprivateserver.site" }), /must use/);
  assert.throws(() => resolveMassiveConfig({ MASSIVE_API_KEY: "secret", MASSIVE_BASE_URL: "https://api.massive.com" }), /must use/);
});

test("maps exceptional symbols", () => {
  assert.equal(toMassiveSymbol("^VIX"), "I:VIX");
  assert.equal(toMassiveSymbol("^NDX"), "I:NDX");
  assert.equal(toMassiveSymbol("BTCUSD"), "X:BTCUSD");
  assert.equal(toMassiveSymbol("SPY"), "SPY");
});

test("normalizes aggregate bars", () => {
  const rows = normalizeMassiveBars("SPY", [{ t: Date.UTC(2026, 6, 10), o: 10, h: 12, l: 9, c: 11, v: 100 }]);
  assert.deepEqual(rows[0], { symbol: "SPY", date: "2026-07-10", time: Date.UTC(2026, 6, 10), open: 10, high: 12, low: 9, close: 11, volume: 100, changePercent: 0 });
});

test("blocks cross-origin pagination", async () => {
  const config = { apiKey: "secret", baseUrl: new URL("https://api.example.test"), allowInsecure: false };
  const fetchImpl = async () => new Response(JSON.stringify({ status: "OK", results: [], next_url: "https://evil.test/steal" }), { status: 200 });
  await assert.rejects(fetchMassiveAggregates(config, { symbol: "SPY", from: "2026-01-01", to: "2026-01-02", fetchImpl }), /changed origin/);
});

test("redacts permanent proxy failures without retrying", async () => {
  const config = resolveMassiveConfig({ MASSIVE_API_KEY: "massive-test-secret" });
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("invalid massive-test-secret", { status: 401 });
  };
  await assert.rejects(
    fetchMassiveAggregates(config, { symbol: "SPY", from: "2026-01-01", to: "2026-01-02", fetchImpl }),
    (error) => !error.message.includes("massive-test-secret") && error.message.includes("<redacted>")
  );
  assert.equal(calls, 1);
});

test("caps aggregate result counts", async () => {
  const config = resolveMassiveConfig({ MASSIVE_API_KEY: "secret" });
  const fetchImpl = async () => Response.json({
    status: "OK",
    results: Array(100_001).fill({ t: Date.UTC(2026, 0, 1) })
  });
  await assert.rejects(
    fetchMassiveAggregates(config, { symbol: "SPY", from: "2026-01-01", to: "2026-01-02", fetchImpl }),
    /result count exceeded/
  );
});

test("rejects bars outside the requested range", async () => {
  const config = resolveMassiveConfig({ MASSIVE_API_KEY: "secret" });
  const fetchImpl = async () => Response.json({
    status: "OK",
    results: [{ t: Date.UTC(2025, 11, 31) }]
  });
  await assert.rejects(
    fetchMassiveAggregates(config, { symbol: "SPY", from: "2026-01-01", to: "2026-01-02", fetchImpl }),
    /outside the requested date range/
  );
});

test("redacts keys and query parameters", () => {
  assert.equal(redactMassiveSecret("failed key-secret?apiKey=key-secret", "key-secret"), "failed <redacted>?apiKey=<redacted>");
});
