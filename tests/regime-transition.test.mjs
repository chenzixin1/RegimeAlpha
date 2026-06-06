import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("latest high-volume down week exposes elevated transition risk", async () => {
  const payload = JSON.parse(await readFile(new URL("../data/regimes.json", import.meta.url), "utf8"));
  const latest = payload.regimes.at(-1);

  assert.equal(latest.weekEnd, "2026-06-05");
  assert.ok(latest.metrics.weeklyReturn <= -0.02);
  assert.ok(latest.metrics.downVolumeZ20 >= 2);
  assert.equal(latest.metrics.distributionDay, true);
  assert.ok(latest.transition, "latest regime should include transition diagnostics");
  assert.ok(latest.transition.pressure >= 65);
  assert.notEqual(latest.code, "bull_quiet");
  assert.ok(["bull_volatile", "sideways_volatile"].includes(latest.code));
});
