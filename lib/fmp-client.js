const DEFAULT_FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const REQUIRED_FMP_ORIGIN = "https://financialmodelingprep.com";
const MAX_FMP_RESPONSE_BYTES = 2 * 1024 * 1024;

export function resolveFmpConfig(source = {}) {
  const apiKey = String(source.FMP_API_KEY || "").trim();
  if (!apiKey) throw new Error("FMP_API_KEY is not configured.");
  const baseUrl = new URL(source.FMP_BASE_URL || DEFAULT_FMP_BASE_URL);
  if (baseUrl.origin !== REQUIRED_FMP_ORIGIN) {
    throw new Error(`FMP requests must use ${REQUIRED_FMP_ORIGIN}.`);
  }
  return { apiKey, baseUrl };
}

export async function fetchFmpDaily(config, { symbol, from, to, fetchImpl = fetch }) {
  const url = new URL("/stable/historical-price-eod/full", config.baseUrl);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("apikey", config.apiKey);
  const payload = await fetchFmpJson(config, url, `FMP ${symbol}`, fetchImpl);
  if (!Array.isArray(payload)) throw new Error(`FMP ${symbol} returned an invalid payload.`);
  for (const bar of payload) {
    if (!isIsoDate(bar?.date) || bar.date < from || bar.date > to) {
      throw new Error(`FMP ${symbol} returned a bar outside the requested date range.`);
    }
  }
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
  const payload = await fetchFmpJson(config, url, "FMP quote request", fetchImpl);
  return Array.isArray(payload) ? payload : [];
}

async function fetchFmpJson(config, url, label, fetchImpl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      const text = await readLimitedText(response, MAX_FMP_RESPONSE_BYTES);
      if (response.ok) return JSON.parse(text);
      const error = new Error(redactFmpSecret(`${label} failed: ${response.status} ${text.slice(0, 200)}`, config.apiKey));
      if (![408, 429].includes(response.status) && response.status < 500) {
        error.retryable = false;
        throw error;
      }
      lastError = error;
    } catch (error) {
      const sanitized = new Error(redactFmpSecret(error?.message || `${label} failed.`, config.apiKey));
      if (error?.retryable === false) throw sanitized;
      lastError = sanitized;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
  }
  throw lastError || new Error(`${label} failed.`);
}

async function readLimitedText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("FMP response exceeded the size limit.");
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
      await reader.cancel("FMP response exceeded the size limit.");
      throw new Error("FMP response exceeded the size limit.");
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

function redactFmpSecret(value, apiKey) {
  return String(value || "")
    .split(apiKey).join("<redacted>")
    .replace(/([?&](?:apikey|api_key)=)[^&\s]+/gi, "$1<redacted>");
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
