import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FMP_PRIMARY_SYMBOLS, SYMBOLS } from "../scripts/build-regimes.mjs";

test("includes Korea ETF, KOSPI, and Nikkei asset regimes", async () => {
  const payload = JSON.parse(await readFile(new URL("../data/regimes.json", import.meta.url), "utf8"));
  const bySymbol = new Map(payload.assetRegimes.map((asset) => [asset.symbol, asset]));

  for (const symbol of ["EWY", "^KS11", "^N225"]) {
    assert.ok(bySymbol.has(symbol), `${symbol} should be present in assetRegimes`);
    assert.ok(bySymbol.get(symbol).regimes.length > 0, `${symbol} should have weekly regimes`);
  }
});

test("tracks Nasdaq 100 index via FMP alongside the QQQ ETF proxy", () => {
  assert.ok(SYMBOLS.includes("QQQ"));
  assert.ok(SYMBOLS.includes("^NDX"));
  assert.ok(FMP_PRIMARY_SYMBOLS.has("^NDX"));
  assert.ok(FMP_PRIMARY_SYMBOLS.has("^N225"));
  assert.equal(FMP_PRIMARY_SYMBOLS.has("QQQ"), false);
  assert.equal(SYMBOLS.filter((symbol) => symbol === "QQQ" || symbol === "^NDX").length, 2);
});
