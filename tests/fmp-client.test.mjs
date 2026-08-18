import assert from "node:assert/strict";
import test from "node:test";
import { fetchFmpDaily, resolveFmpConfig } from "../lib/fmp-client.js";

test("pins FMP requests to the official encrypted origin", () => {
  const config = resolveFmpConfig({ FMP_API_KEY: "secret" });
  assert.equal(config.baseUrl.origin, "https://financialmodelingprep.com");
  assert.throws(
    () => resolveFmpConfig({ FMP_API_KEY: "secret", FMP_BASE_URL: "http://financialmodelingprep.com/stable" }),
    /must use/
  );
  assert.throws(
    () => resolveFmpConfig({ FMP_API_KEY: "secret", FMP_BASE_URL: "https://example.test/stable" }),
    /must use/
  );
});

test("redacts FMP credentials and does not retry permanent failures", async () => {
  const config = resolveFmpConfig({ FMP_API_KEY: "fmp-test-secret" });
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.ok(options.signal);
    return new Response("invalid fmp-test-secret", { status: 401 });
  };
  await assert.rejects(
    fetchFmpDaily(config, { symbol: "^VIX", from: "2026-01-01", to: "2026-01-02", fetchImpl }),
    (error) => !error.message.includes("fmp-test-secret") && error.message.includes("<redacted>")
  );
  assert.equal(calls, 1);
});

test("rejects FMP rows outside the requested range", async () => {
  const config = resolveFmpConfig({ FMP_API_KEY: "secret" });
  const fetchImpl = async () => Response.json([{
    date: "2099-01-01",
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1
  }]);
  await assert.rejects(
    fetchFmpDaily(config, { symbol: "^VIX", from: "2026-01-01", to: "2026-01-02", fetchImpl }),
    /outside the requested date range/
  );
});
