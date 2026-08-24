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
