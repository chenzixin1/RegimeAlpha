import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import updater from "../workers/regime-updater.js";

test("uses an unambiguous Saturday Cloudflare cron trigger", async () => {
  const config = JSON.parse(await readFile(
    new URL("../wrangler.regime-updater.jsonc", import.meta.url),
    "utf8"
  ));

  assert.deepEqual(config.triggers?.crons, ["15 0 * * SAT", "15 3 * * SAT"]);
});

test("surfaces scheduled refresh failures to Cloudflare", async () => {
  await assert.rejects(
    updater.scheduled({ cron: "15 0 * * SAT" }, {}),
    /Scheduled regime refresh failed: MASSIVE_API_KEY is not configured/
  );
});

test("routes cache-busted data requests through the Worker", async () => {
  const config = JSON.parse(await readFile(
    new URL("../wrangler.regime-updater.jsonc", import.meta.url),
    "utf8"
  ));
  const patterns = config.routes.map((route) => route.pattern);

  assert.ok(patterns.includes("regimealpha.chenzixin.uk/data/regimes.json*"));
  assert.ok(patterns.includes("regimealpha.chenzixin.uk/data/local-preview-candles.json*"));
});

test("binds Pages and MCP consumers directly to the D1 updater Worker", async () => {
  const configs = await Promise.all([
    "../wrangler.jsonc",
    "../wrangler.regime-mcp.jsonc"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse)));

  for (const config of configs) {
    assert.deepEqual(config.services, [{
      binding: "REGIME_DATA_SERVICE",
      service: "regimealpha-updater"
    }]);
  }
});
