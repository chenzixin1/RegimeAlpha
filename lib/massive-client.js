import { redactMassiveSecret } from "./massive-config.js";

export const MASSIVE_SYMBOLS = {
  "^VIX": "I:VIX",
  BTCUSD: "X:BTCUSD",
  "^KS11": "I:KOSPI",
  "^N225": "I:NIKKEI225",
  "000660.KS": "000660",
  "005930.KS": "005930"
};

export function toMassiveSymbol(symbol) {
  return MASSIVE_SYMBOLS[symbol] || symbol;
}

export async function fetchMassiveAggregates(config, { symbol, from, to, multiplier = 1, timespan = "day", limit = 50000, fetchImpl = fetch }) {
  const providerSymbol = toMassiveSymbol(symbol);
  const path = `/v2/aggs/ticker/${encodeURIComponent(providerSymbol)}/range/${multiplier}/${timespan}/${from}/${to}`;
  const first = new URL(path, config.baseUrl);
  first.searchParams.set("adjusted", "true");
  first.searchParams.set("sort", "asc");
  first.searchParams.set("limit", String(limit));

  const results = [];
  let next = first;
  for (let page = 0; next && page < 100; page += 1) {
    assertSafeUrl(next, config);
    next.searchParams.set("apiKey", config.apiKey);
    const response = await fetchWithRetry(next, { fetchImpl, config });
    const payload = await response.json();
    if (payload.status && !["OK", "DELAYED"].includes(payload.status)) {
      throw new Error(redactMassiveSecret(`Massive ${symbol} returned ${JSON.stringify(payload).slice(0, 1024)}`, config.apiKey));
    }
    if (Array.isArray(payload.results)) results.push(...payload.results);
    next = payload.next_url ? new URL(payload.next_url, config.baseUrl) : null;
  }
  return { symbol, providerSymbol, results };
}

export function normalizeMassiveBars(symbol, bars) {
  return bars.map((bar) => ({
    symbol,
    date: new Date(Number(bar.t)).toISOString().slice(0, 10),
    time: Number(bar.t),
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c),
    volume: Number(bar.v || 0),
    changePercent: 0
  })).filter(isValidBar).sort((a, b) => a.time - b.time);
}

export function assertSafeUrl(url, config) {
  if (url.origin !== config.baseUrl.origin) throw new Error("Massive pagination changed origin; request blocked.");
  if (["http:", "ws:"].includes(url.protocol) && !config.allowInsecure) throw new Error("Massive pagination downgraded transport; request blocked.");
}

async function fetchWithRetry(url, { fetchImpl, config }) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (response.ok) return response;
      const text = await response.text();
      if (![408, 429].includes(response.status) && response.status < 500) {
        throw new Error(`Massive request failed: ${response.status} ${text.slice(0, 1024)}`);
      }
      lastError = new Error(`Massive request failed: ${response.status} ${text.slice(0, 1024)}`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
  }
  throw new Error(redactMassiveSecret(lastError?.message || "Massive request failed.", config.apiKey));
}

function isValidBar(row) {
  return Number.isFinite(row.time) && [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)
    && row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close) && row.volume >= 0;
}

