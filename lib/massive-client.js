import { redactMassiveSecret } from "./massive-config.js";

const MAX_MASSIVE_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_MASSIVE_PAGES = 20;
const MAX_MASSIVE_RESULTS = 2_500;
const DAY_MS = 86_400_000;

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
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toExclusive = Date.parse(`${to}T00:00:00Z`) + DAY_MS;
  if (!Number.isFinite(fromTime) || !Number.isFinite(toExclusive) || fromTime >= toExclusive) {
    throw new Error("Massive aggregate date range is invalid.");
  }
  const rangeLimit = timespan === "day" && multiplier === 1
    ? Math.min(MAX_MASSIVE_RESULTS, Math.ceil((toExclusive - fromTime) / DAY_MS) + 5)
    : MAX_MASSIVE_RESULTS;
  let next = first;
  for (let page = 0; next && page < MAX_MASSIVE_PAGES; page += 1) {
    assertSafeUrl(next, config);
    next.searchParams.set("apiKey", config.apiKey);
    const payload = await fetchWithRetry(next, { fetchImpl, config });
    if (payload.status && !["OK", "DELAYED"].includes(payload.status)) {
      throw new Error(redactMassiveSecret(`Massive ${symbol} returned ${JSON.stringify(payload).slice(0, 1024)}`, config.apiKey));
    }
    if (Array.isArray(payload.results)) {
      if (payload.results.some((bar) => !Number.isFinite(Number(bar?.t)) || Number(bar.t) < fromTime || Number(bar.t) >= toExclusive)) {
        throw new Error("Massive returned a bar outside the requested date range.");
      }
      if (results.length + payload.results.length > rangeLimit) {
        throw new Error("Massive result count exceeded the safety limit.");
      }
      results.push(...payload.results);
    }
    next = payload.next_url ? new URL(payload.next_url, config.baseUrl) : null;
  }
  if (next) throw new Error("Massive pagination exceeded the safety limit.");
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
      const text = await readLimitedText(response, MAX_MASSIVE_PAGE_BYTES);
      if (response.ok) return JSON.parse(text);
      if (![408, 429].includes(response.status) && response.status < 500) {
        const error = new Error(`Massive request failed: ${response.status} ${text.slice(0, 1024)}`);
        error.retryable = false;
        throw error;
      }
      lastError = new Error(`Massive request failed: ${response.status} ${text.slice(0, 1024)}`);
    } catch (error) {
      if (error?.retryable === false) {
        throw new Error(redactMassiveSecret(error.message, config.apiKey));
      }
      lastError = error;
      if (attempt === 3) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
  }
  throw new Error(redactMassiveSecret(lastError?.message || "Massive request failed.", config.apiKey));
}

async function readLimitedText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Massive response exceeded the size limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel("Massive response exceeded the size limit.");
      throw new Error("Massive response exceeded the size limit.");
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

function isValidBar(row) {
  return Number.isFinite(row.time) && [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)
    && row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close) && row.volume >= 0;
}
