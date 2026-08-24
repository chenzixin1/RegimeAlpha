import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses an unambiguous Saturday Cloudflare cron trigger", async () => {
  const config = JSON.parse(await readFile(
    new URL("../wrangler.regime-updater.jsonc", import.meta.url),
    "utf8"
  ));

  assert.deepEqual(config.triggers?.crons, ["15 0 * * SAT"]);
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
