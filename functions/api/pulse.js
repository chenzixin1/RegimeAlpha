import { resolveMassiveConfig, redactMassiveSecret } from "../../lib/massive-config.js";
import { fetchMassiveAggregates, toMassiveSymbol } from "../../lib/massive-client.js";
import { fetchFmpQuotes, resolveFmpConfig } from "../../lib/fmp-client.js";

const REFRESH_SECONDS = 60;
const CORE_SYMBOLS = ["SPY", "QQQ", "IWM", "SOXX", "SMH", "IGV", "TLT", "BTCUSD"];
const MEMORY_SYMBOLS = ["DRAM", "MU", "SNDK", "000660.KS", "005930.KS", "WDC", "STX"];
const OPTICAL_SYMBOLS = ["AAOI", "LITE", "COHR", "CIEN", "FN", "MTSI", "CRDO", "MRVL", "AVGO", "NOK", "CSCO", "SMTC"];
const QUOTE_SYMBOLS = [...new Set([...CORE_SYMBOLS, ...MEMORY_SYMBOLS, ...OPTICAL_SYMBOLS])];
const CHART_SYMBOLS = ["SPY", "QQQ", "SOXX", "MU", "SNDK"];
const VIX_SYMBOL = "^VIX";
const SYMBOL_META = {
  DRAM: { displaySymbol: "DRAM", alias: "Roundhill Memory ETF", theme: "Memory ETF / 主题锚点", group: "ETF" },
  MU: { displaySymbol: "MU", alias: "美光 / Micron", theme: "DRAM / HBM", group: "Memory" },
  SNDK: { displaySymbol: "SNDK", alias: "闪迪 / Sandisk", theme: "NAND / SSD", group: "Flash" },
  "000660.KS": { displaySymbol: "海力士", alias: "SK hynix", theme: "HBM / DRAM", group: "Korea" },
  "005930.KS": { displaySymbol: "三星电子", alias: "Samsung Electronics", theme: "Memory / Foundry", group: "Korea" },
  WDC: { displaySymbol: "WDC", alias: "西数 / Western Digital", theme: "HDD / Storage", group: "Storage" },
  STX: { displaySymbol: "STX", alias: "希捷 / Seagate", theme: "HDD / Storage", group: "Storage" },
  AAOI: { displaySymbol: "AAOI", alias: "Applied Optoelectronics", theme: "光模块 / Datacenter optics", group: "Optical Core" },
  LITE: { displaySymbol: "LITE", alias: "Lumentum", theme: "光器件 / Lasers", group: "Optical Core" },
  COHR: { displaySymbol: "COHR", alias: "Coherent", theme: "光器件 / Transceivers", group: "Optical Core" },
  CIEN: { displaySymbol: "CIEN", alias: "Ciena", theme: "光网络设备", group: "Optical Systems" },
  FN: { displaySymbol: "FN", alias: "Fabrinet", theme: "光模块制造 / EMS", group: "Optical Supply" },
  MTSI: { displaySymbol: "MTSI", alias: "MACOM", theme: "高速光电芯片", group: "Optical Chips" },
  CRDO: { displaySymbol: "CRDO", alias: "Credo", theme: "高速互连 / AEC", group: "Connectivity" },
  MRVL: { displaySymbol: "MRVL", alias: "Marvell", theme: "DSP / PAM4 / DCI", group: "Connectivity" },
  AVGO: { displaySymbol: "AVGO", alias: "Broadcom", theme: "交换芯片 / 光互连间接", group: "Indirect" },
  NOK: { displaySymbol: "NOK", alias: "Nokia / Infinera", theme: "光网络设备", group: "Indirect" },
  CSCO: { displaySymbol: "CSCO", alias: "Cisco / Acacia", theme: "网络设备 / 相干光", group: "Indirect" },
  SMTC: { displaySymbol: "SMTC", alias: "Semtech", theme: "高速信号 / datacenter", group: "Indirect" }
};

let memoryCache = null;

export async function onRequestGet({ env, request }) {
  const now = Date.now();
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  if (!force && memoryCache && memoryCache.expiresAt > now) {
    return json(memoryCache.payload, 200, "HIT");
  }

  let config;
  let fmpConfig;
  try {
    config = resolveMassiveConfig(env);
    fmpConfig = resolveFmpConfig(env);
  } catch (error) {
    return json(
      {
        error: error.message,
        generatedAt: new Date().toISOString(),
        refreshSeconds: REFRESH_SECONDS
      },
      500,
      "MISS"
    );
  }

  try {
    const payload = await buildPulse(config, fmpConfig);
    memoryCache = {
      payload,
      expiresAt: now + REFRESH_SECONDS * 1000
    };
    return json(payload, 200, "MISS");
  } catch (error) {
    if (memoryCache?.payload) {
      return json(
        {
          ...memoryCache.payload,
          stale: true,
          error: error.message || "Pulse refresh failed."
        },
        200,
        "STALE"
      );
    }
    return json(
      {
        error: error.message || "Pulse refresh failed.",
        generatedAt: new Date().toISOString(),
        refreshSeconds: REFRESH_SECONDS
      },
      502,
      "MISS"
    );
  }
}

async function buildPulse(config, fmpConfig) {
  const now = new Date();
  const from = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const [snapshot, fmpQuotes, chartEntries] = await Promise.all([
    fetchMassiveSnapshot(config, QUOTE_SYMBOLS.filter((symbol) => !symbol.startsWith("^") && !symbol.includes(".") && symbol !== "BTCUSD")),
    fetchFmpQuotes(fmpConfig, [VIX_SYMBOL, "BTCUSD", "000660.KS", "005930.KS"]),
    Promise.all(
      CHART_SYMBOLS.map(async (symbol) => [
        symbol,
        normalizeMassiveChartBars((await fetchMassiveAggregates(config, { symbol, from, to, multiplier: 5, timespan: "minute", limit: 5000 })).results)
      ])
    )
  ]);

  const rawQuotes = [...snapshot.map(normalizeMassiveSnapshot), ...fmpQuotes];
  const spy = rawQuotes.find((quote) => quote.symbol === "SPY");
  const spyChange = normalizePercent(spy?.changePercentage);
  const quotes = rawQuotes
    .map((quote) => normalizeQuote(quote, spyChange))
    .filter(Boolean)
    .sort((a, b) => orderOf(a.symbol) - orderOf(b.symbol));
  const charts = Object.fromEntries(
    chartEntries.map(([symbol, rows]) => [symbol, normalizeChart(rows)])
  );
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const signals = buildSignals(quoteMap, charts);
  const { pressureScore, pressureLabel, pressureTone, alerts } = buildPressure(signals, quoteMap, charts);

  return {
    generatedAt: new Date().toISOString(),
    refreshSeconds: REFRESH_SECONDS,
    marketSession: getMarketSession(),
    quotes: quotes.map((quote) => ({
      ...quote,
      ...buildQuoteSignal(quote)
    })),
    memoryWatchlist: MEMORY_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(Boolean).map((quote) => ({
      ...quote,
      ...buildQuoteSignal(quote)
    })),
    opticalWatchlist: OPTICAL_SYMBOLS.map((symbol) => quoteMap.get(symbol)).filter(Boolean).map((quote) => ({
      ...quote,
      ...buildQuoteSignal(quote)
    })),
    charts,
    signals,
    pressureScore,
    pressureLabel,
    pressureTone,
    alerts
  };
}

async function fetchMassiveSnapshot(config, symbols) {
  const url = new URL("/v2/snapshot/locale/us/markets/stocks/tickers", config.baseUrl);
  url.searchParams.set("tickers", symbols.map(toMassiveSymbol).join(","));
  url.searchParams.set("apiKey", config.apiKey);
  const response = await fetch(url, { cf: { cacheTtl: 30, cacheEverything: false } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(redactMassiveSecret(`Massive snapshot failed: ${response.status} ${text.slice(0, 120)}`, config.apiKey));
  }
  try {
    const payload = JSON.parse(text);
    return asArray(payload.tickers);
  } catch {
    throw new Error(redactMassiveSecret(`Massive returned non-JSON: ${text.slice(0, 120)}`, config.apiKey));
  }
}

function normalizeMassiveSnapshot(row) {
  return {
    symbol: row.ticker,
    name: row.ticker,
    price: row.lastTrade?.p ?? row.day?.c,
    change: row.todaysChange,
    changePercentage: row.todaysChangePerc,
    volume: row.day?.v,
    dayLow: row.day?.l,
    dayHigh: row.day?.h,
    previousClose: row.prevDay?.c,
    timestamp: row.updated,
    exchange: row.lastTrade?.x ? String(row.lastTrade.x) : null
  };
}

function normalizeMassiveChartBars(rows) {
  return asArray(rows).map((row) => ({
    date: new Date(Number(row.t)).toISOString().replace("T", " ").slice(0, 19),
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v || 0)
  }));
}

function normalizeQuote(quote, spyChange) {
  const symbol = quote?.symbol;
  const price = finite(quote?.price);
  if (!symbol || !Number.isFinite(price)) return null;
  const changePercent = normalizePercent(quote.changePercentage);
  return {
    symbol,
    displaySymbol: SYMBOL_META[symbol]?.displaySymbol || (symbol === "BTCUSD" ? "BTC" : symbol === VIX_SYMBOL ? "VIX" : symbol),
    alias: SYMBOL_META[symbol]?.alias || null,
    theme: SYMBOL_META[symbol]?.theme || null,
    group: SYMBOL_META[symbol]?.group || null,
    name: quote.name || symbol,
    price,
    change: finite(quote.change),
    changePercent,
    relativeToSpy: symbol === "SPY" || symbol === VIX_SYMBOL ? 0 : round(changePercent - spyChange, 5),
    volume: finite(quote.volume),
    dayLow: finite(quote.dayLow),
    dayHigh: finite(quote.dayHigh),
    previousClose: finite(quote.previousClose),
    timestamp: quote.timestamp || null,
    exchange: quote.exchange || null,
    session: getSymbolSession(symbol, quote.exchange)
  };
}

function normalizeChart(rows) {
  const sorted = asArray(rows)
    .map((row) => ({
      date: row.date,
      time: row.date ? Date.parse(row.date.replace(" ", "T")) : null,
      open: finite(row.open),
      high: finite(row.high),
      low: finite(row.low),
      close: finite(row.close),
      volume: finite(row.volume)
    }))
    .filter((row) => row.date && Number.isFinite(row.close))
    .sort((a, b) => b.time - a.time);

  const latestDate = sorted[0]?.date?.slice(0, 10);
  const sessionRows = sorted
    .filter((row) => row.date.slice(0, 10) === latestDate)
    .sort((a, b) => a.time - b.time);
  const first = sessionRows[0];
  const last = sessionRows.at(-1);
  const high = Math.max(...sessionRows.map((row) => row.high).filter(Number.isFinite));
  const low = Math.min(...sessionRows.map((row) => row.low).filter(Number.isFinite));
  const closes = sessionRows.slice(-36).map((row) => row.close).filter(Number.isFinite);

  return {
    date: latestDate || null,
    points: sessionRows.length,
    open: first?.open ?? null,
    last: last?.close ?? null,
    direction: Number.isFinite(first?.open) && Number.isFinite(last?.close) ? round(last.close / first.open - 1, 5) : null,
    range: Number.isFinite(high) && Number.isFinite(low) ? round(high / low - 1, 5) : null,
    sparkline: closes
  };
}

function buildSignals(quoteMap, charts) {
  const spy = quoteMap.get("SPY");
  const qqq = quoteMap.get("QQQ");
  const iwm = quoteMap.get("IWM");
  const soxx = quoteMap.get("SOXX");
  const tlt = quoteMap.get("TLT");
  const vix = quoteMap.get(VIX_SYMBOL);
  const spyChange = spy?.changePercent || 0;
  const vixChange = vix?.changePercent || 0;
  const qqqRelativeToSpy = (qqq?.changePercent || 0) - spyChange;
  const soxxRelativeToSpy = (soxx?.changePercent || 0) - spyChange;
  const iwmRelativeToSpy = (iwm?.changePercent || 0) - spyChange;
  const spyIntradayRange = charts.SPY?.range || 0;
  const soxxIntradayRange = charts.SOXX?.range || 0;
  const tltChange = tlt?.changePercent || 0;
  const riskTone = vixChange > 0.025 && spyChange < -0.004 ? "risk_off" : vixChange < -0.015 && spyChange > 0.004 ? "risk_on" : "mixed";

  return {
    summary: summarizePulse({ spyChange, vixChange, qqqRelativeToSpy, soxxRelativeToSpy, spyIntradayRange, riskTone }),
    riskTone,
    spyChange: round(spyChange, 5),
    vixChange: round(vixChange, 5),
    qqqRelativeToSpy: round(qqqRelativeToSpy, 5),
    soxxRelativeToSpy: round(soxxRelativeToSpy, 5),
    iwmRelativeToSpy: round(iwmRelativeToSpy, 5),
    spyIntradayRange: round(spyIntradayRange, 5),
    soxxIntradayRange: round(soxxIntradayRange, 5),
    tltChange: round(tltChange, 5)
  };
}

function buildPressure(signals, quoteMap, charts) {
  const spy = quoteMap.get("SPY");
  const qqq = quoteMap.get("QQQ");
  const soxx = quoteMap.get("SOXX");
  const tlt = quoteMap.get("TLT");
  const vix = quoteMap.get(VIX_SYMBOL);
  let score = 0;

  score += scale(Math.abs(spy?.changePercent || 0), 0.004, 0.02) * 20;
  score += scale(Math.max(0, vix?.changePercent || 0), 0.01, 0.08) * 25;
  score += scale(Math.abs((qqq?.changePercent || 0) - (spy?.changePercent || 0)), 0.0035, 0.018) * 15;
  score += scale(Math.abs((soxx?.changePercent || 0) - (spy?.changePercent || 0)), 0.005, 0.03) * 15;
  score += scale(charts.SPY?.range || 0, 0.006, 0.03) * 15;
  if ((spy?.changePercent || 0) < -0.004 && (tlt?.changePercent || 0) < -0.002) {
    score += 10;
  }

  const pressureScore = Math.round(Math.max(0, Math.min(100, score)));
  const pressureLabel = pressureScore >= 75 ? "高敏预警" : pressureScore >= 55 ? "Regime 被挑战" : pressureScore >= 30 ? "观察" : "平静";
  const pressureTone = pressureScore >= 75 ? "alert" : pressureScore >= 55 ? "challenged" : pressureScore >= 30 ? "watch" : "calm";

  return {
    pressureScore,
    pressureLabel,
    pressureTone,
    alerts: buildAlerts(signals, quoteMap, charts)
  };
}

function buildAlerts(signals, quoteMap, charts) {
  const spy = quoteMap.get("SPY");
  const qqq = quoteMap.get("QQQ");
  const soxx = quoteMap.get("SOXX");
  const tlt = quoteMap.get("TLT");
  const vix = quoteMap.get(VIX_SYMBOL);
  const alerts = [];

  if ((spy?.changePercent || 0) < -0.005 && (vix?.changePercent || 0) > 0.02) {
    alerts.push({
      type: "risk_off",
      label: "Risk-off",
      severity: "hot",
      reason: `SPY ${pct(spy.changePercent)}，VIX ${pct(vix.changePercent)}`,
      impact: "指数下跌和隐含波动同步抬升"
    });
  }

  if ((spy?.changePercent || 0) > 0.004 && (qqq?.changePercent || 0) > 0.006 && (soxx?.changePercent || 0) > 0.008 && (vix?.changePercent || 0) < -0.01) {
    alerts.push({
      type: "risk_on",
      label: "Risk-on",
      severity: "good",
      reason: `SPY ${pct(spy.changePercent)}，QQQ ${pct(qqq.changePercent)}，SOXX ${pct(soxx.changePercent)}`,
      impact: "成长和半导体带动风险偏好"
    });
  }

  if ((vix?.changePercent || 0) > 0.04 || (charts.SPY?.range || 0) > 0.014) {
    alerts.push({
      type: "vol_spike",
      label: "Vol spike",
      severity: "warn",
      reason: `VIX ${pct(vix?.changePercent || 0)}，SPY 盘中振幅 ${pct(charts.SPY?.range || 0)}`,
      impact: "波动扩张开始挑战低波判断"
    });
  }

  const maxRelative = Math.max(
    Math.abs(signals.qqqRelativeToSpy || 0),
    Math.abs(signals.soxxRelativeToSpy || 0),
    Math.abs(signals.iwmRelativeToSpy || 0)
  );
  if (maxRelative > 0.0075) {
    alerts.push({
      type: "rotation",
      label: "Rotation",
      severity: "watch",
      reason: `QQQ/SPY ${pct(signals.qqqRelativeToSpy)}，SOXX/SPY ${pct(signals.soxxRelativeToSpy)}`,
      impact: "板块相对强弱出现盘中分化"
    });
  }

  if ((spy?.changePercent || 0) < -0.003 && (tlt?.changePercent || 0) < -0.002 && (vix?.changePercent || 0) > 0.01) {
    alerts.push({
      type: "stagflation_watch",
      label: "Stagflation watch",
      severity: "hot",
      reason: `SPY ${pct(spy.changePercent)}，TLT ${pct(tlt.changePercent)}，VIX ${pct(vix.changePercent)}`,
      impact: "股债同跌且波动上行"
    });
  }

  return alerts;
}

function buildQuoteSignal(quote) {
  const absChange = Math.abs(quote.changePercent || 0);
  if (quote.symbol === VIX_SYMBOL && quote.changePercent > 0.025) {
    return { signalTag: "Vol up", signalTone: "warn" };
  }
  if (quote.symbol !== "SPY" && Math.abs(quote.relativeToSpy || 0) > 0.01) {
    return quote.relativeToSpy > 0
      ? { signalTag: "Leads SPY", signalTone: "good" }
      : { signalTag: "Lags SPY", signalTone: "bad" };
  }
  if (absChange > 0.012) {
    return quote.changePercent > 0
      ? { signalTag: "Momentum", signalTone: "good" }
      : { signalTag: "Pressure", signalTone: "bad" };
  }
  return { signalTag: "Normal", signalTone: "neutral" };
}

function summarizePulse({ spyChange, vixChange, qqqRelativeToSpy, soxxRelativeToSpy, spyIntradayRange, riskTone }) {
  const parts = [
    `SPY ${pct(spyChange)}`,
    `VIX ${pct(vixChange)}`,
    `QQQ/SPY ${pct(qqqRelativeToSpy)}`,
    `SOXX/SPY ${pct(soxxRelativeToSpy)}`,
    `range ${pct(spyIntradayRange)}`
  ];
  const lead = riskTone === "risk_off" ? "盘中偏防御" : riskTone === "risk_on" ? "盘中偏进攻" : "盘中信号混合";
  return `${lead}：${parts.join(" / ")}`;
}

function getMarketSession() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const day = parts.weekday;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !["Sat", "Sun"].includes(day);
  let state = "closed";
  if (weekday && minutes >= 4 * 60 && minutes < 9 * 60 + 30) state = "premarket";
  if (weekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60) state = "regular";
  if (weekday && minutes >= 16 * 60 && minutes < 20 * 60) state = "aftermarket";
  const labels = {
    premarket: "美股盘前",
    regular: "美股盘中",
    aftermarket: "美股盘后",
    closed: "美股休市"
  };
  return { state, label: labels[state] };
}

function getSymbolSession(symbol, exchange) {
  if (symbol === "BTCUSD") {
    return { state: "regular", label: "24H", venue: "Crypto" };
  }

  if (symbol.endsWith(".KS") || exchange === "KSC") {
    return getTimedSession({
      timeZone: "Asia/Seoul",
      open: 9 * 60,
      close: 15 * 60 + 30,
      premarketStart: 8 * 60,
      aftermarketEnd: 18 * 60,
      venue: "KRX"
    });
  }

  return getTimedSession({
    timeZone: "America/New_York",
    open: 9 * 60 + 30,
    close: 16 * 60,
    premarketStart: 4 * 60,
    aftermarketEnd: 20 * 60,
    venue: exchange || "US"
  });
}

function getTimedSession({ timeZone, open, close, premarketStart, aftermarketEnd, venue }) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const weekday = !["Sat", "Sun"].includes(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  let state = "closed";
  if (weekday && minutes >= premarketStart && minutes < open) state = "premarket";
  if (weekday && minutes >= open && minutes < close) state = "regular";
  if (weekday && minutes >= close && minutes < aftermarketEnd) state = "aftermarket";
  const labels = {
    premarket: "盘前",
    regular: "盘中",
    aftermarket: "盘后",
    closed: "休市"
  };
  return { state, label: labels[state], venue };
}

function normalizePercent(value) {
  const number = finite(value);
  return Number.isFinite(number) ? round(number / 100, 5) : 0;
}

function finite(value) {
  const number = Number(String(value ?? "").replace("%", ""));
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function orderOf(symbol) {
  const order = ["SPY", "QQQ", "IWM", "SOXX", "SMH", "IGV", "TLT", "BTCUSD", VIX_SYMBOL, ...MEMORY_SYMBOLS, ...OPTICAL_SYMBOLS];
  const index = order.indexOf(symbol);
  return index >= 0 ? index : 99;
}

function scale(value, low, high) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, (value - low) / Math.max(0.000001, high - low)));
}

function pct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function round(value, digits = 5) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function json(payload, status, cacheStatus) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
      "x-pulse-cache": cacheStatus
    }
  });
}
