import assert from "node:assert/strict";
import test from "node:test";
import { generateRegimeData } from "../scripts/build-regimes.mjs";

test("runs full and incremental regime generation without filesystem state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const symbol = url.hostname === "fmp.test"
      ? url.searchParams.get("symbol")
      : decodeURIComponent(url.pathname.split("/ticker/")[1].split("/range/")[0]);
    let bars = dailyBars(symbol);
    if (url.hostname === "fmp.test") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      bars = bars.filter((bar) => {
        const date = new Date(bar.t).toISOString().slice(0, 10);
        return (!from || date >= from) && (!to || date <= to);
      });
      return Response.json(bars.map((bar) => ({
        date: new Date(bar.t).toISOString().slice(0, 10),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        changePercent: 0
      })));
    }
    const range = url.pathname.match(/\/range\/1\/day\/([^/]+)\/([^/]+)/);
    if (range) {
      bars = bars.filter((bar) => {
        const date = new Date(bar.t).toISOString().slice(0, 10);
        return date >= range[1] && date <= range[2];
      });
    }
    return Response.json({ status: "OK", results: bars });
  };

  try {
    const providerOptions = {
      massiveConfig: {
        apiKey: "test-massive-key",
        baseUrl: new URL("https://massive.test"),
        allowInsecure: false
      },
      fmpConfig: {
        apiKey: "test-fmp-key",
        baseUrl: new URL("https://fmp.test")
      },
      refresh: true,
      sqliteEnabled: false
    };
    const initial = await generateRegimeData({ ...providerOptions, asOf: "2026-08-10" });
    const updated = await generateRegimeData({
      ...providerOptions,
      asOf: "2026-08-18",
      previousDataThrough: initial.payload.metadata.dataThrough,
      incremental: true
    });

    assert.ok(initial.payload.regimes.length > 100);
    assert.equal(updated.payload.metadata.dataThrough, "2026-08-18");
    assert.equal(updated.payload.summary.latest.weekEnd, "2026-08-18");
    assert.equal(updated.assetWeekCandles.weekEnd, "2026-08-18");
    assert.equal(updated.payload.assetRegimes.length, 30);
    assert.ok(updated.payload.regimes.length < initial.payload.regimes.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function dailyBars(symbol) {
  const rows = [];
  const seed = [...String(symbol)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const start = Date.parse("2023-01-02T00:00:00Z");
  for (let day = 0; day < 1400; day += 1) {
    const time = start + day * 86_400_000;
    const weekday = new Date(time).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const index = rows.length;
    const base = symbol === "^VIX" || symbol === "I:VIX" ? 18 : 50 + (seed % 100);
    const close = base * (1 + index * 0.00035) * (1 + Math.sin((index + seed) / 17) * 0.015);
    const open = close * (1 + Math.sin(index / 11) * 0.002);
    rows.push({
      t: time,
      o: open,
      h: Math.max(open, close) * 1.006,
      l: Math.min(open, close) * 0.994,
      c: close,
      v: 1_000_000 + ((index + seed) % 50) * 10_000
    });
  }
  return rows;
}
