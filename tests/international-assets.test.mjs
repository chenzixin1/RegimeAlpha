import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("includes Korea ETF, KOSPI, and Nikkei asset regimes", async () => {
  const payload = JSON.parse(await readFile(new URL("../data/regimes.json", import.meta.url), "utf8"));
  const bySymbol = new Map(payload.assetRegimes.map((asset) => [asset.symbol, asset]));

  for (const symbol of ["EWY", "^KS11", "^N225"]) {
    assert.ok(bySymbol.has(symbol), `${symbol} should be present in assetRegimes`);
    assert.ok(bySymbol.get(symbol).regimes.length > 0, `${symbol} should have weekly regimes`);
  }
});
