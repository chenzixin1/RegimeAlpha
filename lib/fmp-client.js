const DEFAULT_FMP_BASE_URL = "https://financialmodelingprep.com/stable";

export function resolveFmpConfig(source = {}) {
  const apiKey = String(source.FMP_API_KEY || "").trim();
  if (!apiKey) throw new Error("FMP_API_KEY is not configured.");
  return { apiKey, baseUrl: new URL(source.FMP_BASE_URL || DEFAULT_FMP_BASE_URL) };
}

export async function fetchFmpDaily(config, { symbol, from, to, fetchImpl = fetch }) {
  const url = new URL("/stable/historical-price-eod/full", config.baseUrl);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("apikey", config.apiKey);
  const response = await fetchImpl(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`FMP ${symbol} failed: ${response.status} ${text.slice(0, 200)}`);
  const payload = JSON.parse(text);
  if (!Array.isArray(payload)) throw new Error(`FMP ${symbol} returned an invalid payload.`);
  return payload.map((bar) => ({
    symbol,
    date: bar.date,
    time: Date.parse(`${bar.date}T00:00:00Z`),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume || 0),
    changePercent: Number(bar.changePercent || 0)
  })).filter((row) => row.date && Number.isFinite(row.close)).sort((a, b) => a.time - b.time);
}

export async function fetchFmpQuotes(config, symbols, fetchImpl = fetch) {
  const url = new URL("/stable/batch-quote", config.baseUrl);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("apikey", config.apiKey);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`FMP quote request failed: ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}
