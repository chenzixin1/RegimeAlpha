import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { resolveMassiveConfig } from "../lib/massive-config.js";
import { fetchMassiveAggregates, normalizeMassiveBars, toMassiveSymbol } from "../lib/massive-client.js";
import { fetchFmpDaily, resolveFmpConfig } from "../lib/fmp-client.js";

loadLocalEnv([".env.local", ".env"]);

const MASSIVE_CONFIG = resolveMassiveConfig(process.env);
const FMP_CONFIG = resolveFmpConfig(process.env);
const FMP_PRIMARY_SYMBOLS = new Set(["^VIX", "^KS11", "^N225"]);
const AS_OF = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
const REFRESH = process.env.REGIME_REFRESH === "1";
const INCREMENTAL = process.env.REGIME_INCREMENTAL === "1";
const PREVIOUS_PAYLOAD_PATH = process.env.REGIME_PREVIOUS_PAYLOAD || "data/regimes.json";
const SQLITE_BIN = process.env.SQLITE_BIN || "sqlite3";
const SQLITE_PATH = process.env.REGIME_SQLITE_PATH || ".cache/regime-alpha.sqlite";
const SQLITE_ENABLED = process.env.REGIME_CACHE !== "off" && commandExists(SQLITE_BIN);

const DAY = 24 * 60 * 60 * 1000;
const PREVIOUS_PAYLOAD = INCREMENTAL ? readPreviousPayload(PREVIOUS_PAYLOAD_PATH) : null;
const OUTPUT_END = parseDate(AS_OF);
const FULL_OUTPUT_START = addYears(OUTPUT_END, -5);
const INCREMENTAL_REPLACE_START = PREVIOUS_PAYLOAD?.metadata?.dataThrough
  ? startOfWeek(addDays(parseDate(PREVIOUS_PAYLOAD.metadata.dataThrough), -120))
  : FULL_OUTPUT_START;
const OUTPUT_START = process.env.REGIME_OUTPUT_START_DATE
  ? parseDate(process.env.REGIME_OUTPUT_START_DATE)
  : INCREMENTAL
    ? maxDate(FULL_OUTPUT_START, INCREMENTAL_REPLACE_START)
    : FULL_OUTPUT_START;
const FETCH_START = process.env.REGIME_FETCH_START_DATE
  ? parseDate(process.env.REGIME_FETCH_START_DATE)
  : addDays(OUTPUT_START, -460);

const PRIMARY_SYMBOLS = ["SPY", "^VIX", "TLT", "QQQ", "IWM"];
const BROAD_SECTOR_PROXIES = [
  { symbol: "XLK", displaySymbol: "XLK", name: "Technology", group: "Sector" },
  { symbol: "XLF", displaySymbol: "XLF", name: "Financials", group: "Sector" },
  { symbol: "XLY", displaySymbol: "XLY", name: "Consumer Discretionary", group: "Sector" },
  { symbol: "XLP", displaySymbol: "XLP", name: "Consumer Staples", group: "Sector" },
  { symbol: "XLE", displaySymbol: "XLE", name: "Energy", group: "Sector" },
  { symbol: "XLV", displaySymbol: "XLV", name: "Health Care", group: "Sector" },
  { symbol: "XLI", displaySymbol: "XLI", name: "Industrials", group: "Sector" },
  { symbol: "XLU", displaySymbol: "XLU", name: "Utilities", group: "Sector" },
  { symbol: "XLB", displaySymbol: "XLB", name: "Materials", group: "Sector" },
  { symbol: "XLRE", displaySymbol: "XLRE", name: "Real Estate", group: "Sector" },
  { symbol: "XLC", displaySymbol: "XLC", name: "Communication Services", group: "Sector" }
];
const INDUSTRY_PROXIES = [
  { symbol: "SOXX", displaySymbol: "SOX", name: "Semiconductors", group: "Industry", proxyNote: "FMP EOD did not return ^SOX; SOXX is used as a liquid semiconductor proxy." },
  { symbol: "IGV", displaySymbol: "IGV", name: "Software", group: "Industry" },
  { symbol: "SMH", displaySymbol: "SMH", name: "Mega-cap Semiconductors", group: "Industry" },
  { symbol: "DRAM", displaySymbol: "DRAM", name: "Memory & Storage", group: "Custom" },
  { symbol: "BTCUSD", displaySymbol: "BTC", name: "Bitcoin", group: "Custom", proxyNote: "FMP BTCUSD is used as the Bitcoin proxy." },
  { symbol: "XSW", displaySymbol: "XSW", name: "Equal-weight Software", group: "Industry" },
  { symbol: "IBB", displaySymbol: "IBB", name: "Biotech", group: "Industry" },
  { symbol: "KRE", displaySymbol: "KRE", name: "Regional Banks", group: "Industry" },
  { symbol: "XRT", displaySymbol: "XRT", name: "Retail", group: "Industry" },
  { symbol: "XHB", displaySymbol: "XHB", name: "Homebuilders", group: "Industry" },
  { symbol: "XOP", displaySymbol: "XOP", name: "Oil & Gas E&P", group: "Industry" },
  { symbol: "XME", displaySymbol: "XME", name: "Metals & Mining", group: "Industry" },
  { symbol: "IYT", displaySymbol: "IYT", name: "Transports", group: "Industry" }
];
const INTERNATIONAL_PROXIES = [
  { symbol: "EWY", displaySymbol: "EWY", name: "iShares MSCI South Korea ETF", group: "International" },
  { symbol: "^KS11", displaySymbol: "KOSPI", name: "KOSPI Composite", group: "International", proxyNote: "FMP ^KS11 is used as the Korea equity index proxy." },
  { symbol: "^N225", displaySymbol: "Nikkei 225", name: "Nikkei 225", group: "International", proxyNote: "FMP ^N225 is used as the Japan/Nikkei equity index proxy." }
];

function loadLocalEnv(paths) {
  for (const envPath of paths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const contents = readFileSync(envPath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }

      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
const ASSET_PROXIES = [
  { symbol: "SPY", displaySymbol: "SPY", name: "S&P 500", group: "Market" },
  { symbol: "QQQ", displaySymbol: "QQQ", name: "Nasdaq 100", group: "Style" },
  { symbol: "IWM", displaySymbol: "IWM", name: "Russell 2000", group: "Style" },
  ...BROAD_SECTOR_PROXIES,
  ...INDUSTRY_PROXIES,
  ...INTERNATIONAL_PROXIES
];
const SECTOR_SYMBOLS = BROAD_SECTOR_PROXIES.map((proxy) => proxy.symbol);
const SYMBOLS = [...new Set([...PRIMARY_SYMBOLS, ...ASSET_PROXIES.map((proxy) => proxy.symbol)])];

const REGIMES = {
  bull_quiet: {
    order: 1,
    label: "Bull Quiet",
    labelZh: "牛市低波",
    family: "bull",
    thesis: "稳步上行、低波动、相关性下降，适合横截面 alpha 和分散化多头。"
  },
  bull_volatile: {
    order: 2,
    label: "Bull Volatile",
    labelZh: "牛市高波",
    family: "bull",
    thesis: "价格上涨但波动扩张，主题拥挤和追涨资金推高收益同时增加回撤风险。"
  },
  bear_quiet: {
    order: 3,
    label: "Bear Quiet",
    labelZh: "熊市低波",
    family: "bear",
    thesis: "有序下跌、恐慌不强，更多是基本面或估值慢速下修。"
  },
  bear_volatile: {
    order: 4,
    label: "Bear Volatile",
    labelZh: "熊市高波",
    family: "bear",
    thesis: "下跌速度快、VIX/实现波动和相关性同步抬升，流动性退潮。"
  },
  sideways_quiet: {
    order: 5,
    label: "Sideways Quiet",
    labelZh: "震荡低波",
    family: "sideways",
    thesis: "方向弱、波动低，指数在区间内消化，行业轮动比 beta 更重要。"
  },
  sideways_volatile: {
    order: 6,
    label: "Sideways Volatile",
    labelZh: "震荡高波",
    family: "sideways",
    thesis: "净方向不足但日内/周内摆动很大，趋势策略容易被双向打脸。"
  },
  trend_accelerating: {
    order: 7,
    label: "Trend-Accelerating",
    labelZh: "趋势加速",
    family: "special",
    thesis: "从整理转入高自相关趋势，领涨板块或主题获得连续资金流。"
  },
  mean_reverting: {
    order: 8,
    label: "Mean-Reverting",
    labelZh: "均值回归",
    family: "special",
    thesis: "方向运动进入末段，买卖压力衰竭，反转和价差收敛占优。"
  },
  stagflationary: {
    order: 9,
    label: "Stagflationary",
    labelZh: "滞胀冲击",
    family: "special",
    thesis: "股票和长债同步承压，股债相关性转正，传统 60/40 分散失效。"
  },
  microstructure_dislocation: {
    order: 10,
    label: "Microstructure Dislocation",
    labelZh: "微观结构错位",
    family: "special",
    thesis: "外生冲击或流动性断层造成短暂定价失真，跳空、价差和成交异常放大。"
  }
};

const STRATEGIES = {
  bull_quiet: {
    best: ["AI 增强横截面动量", "离散度/相关性风险溢价", "Quantamental 供应链 alpha"],
    avoid: ["重仓长波动保护", "过早做空趋势"],
    note: "低相关和低波动提高 stock picking 的信息比率。"
  },
  bull_volatile: {
    best: ["单股 LETF 趋势跟随", "波动过滤择时", "短久期事件期权"],
    avoid: ["裸卖波动", "忽视回撤的杠杆 ETF"],
    note: "上行阶段追随趋势，但需要随波动升高降杠杆。"
  },
  bear_quiet: {
    best: ["统计套利/配对交易", "防御型多空", "现金缓冲"],
    avoid: ["高 beta 多头", "不设止损的 LETF"],
    note: "下跌有序时，价差和基本面分化仍可交易。"
  },
  bear_volatile: {
    best: ["尾部风险对冲", "动态期限结构", "长波动/减仓"],
    avoid: ["短指数波动", "高杠杆趋势追涨"],
    note: "相关性趋近 1 时，保护凸性比寻找分散 alpha 更关键。"
  },
  sideways_quiet: {
    best: ["0DTE/短期期权 VRP", "配对交易", "市场中性 LS"],
    avoid: ["追突破", "高成本长波动"],
    note: "区间内低波动适合收取时间价值和做相对价值。"
  },
  sideways_volatile: {
    best: ["LETF 衰减收割", "统计套利", "波动过滤择时"],
    avoid: ["无过滤趋势跟随", "满仓方向 beta"],
    note: "方向收益不足时，路径依赖和方差损耗成为主要 alpha 来源。"
  },
  trend_accelerating: {
    best: ["单股 LETF 趋势跟随", "半导体/科技周期轮动", "Agentic AI 基本面跟踪"],
    avoid: ["过早均值回归", "机械卖出赢家"],
    note: "连续正自相关让杠杆产品从线性放大转为几何复利。"
  },
  mean_reverting: {
    best: ["统计套利/配对交易", "短期期权 VRP", "降低 LETF 敞口"],
    avoid: ["追逐末端趋势", "高 gamma 裸露"],
    note: "冲刺后的拥挤头寸松动，价差和指数都更容易回拉。"
  },
  stagflationary: {
    best: ["动态期限结构", "波动过滤择时", "现金/低 beta 组合"],
    avoid: ["传统 60/40 假设", "长久期保护性期权过度依赖"],
    note: "利率和权益风险同向恶化，方向 beta 的解释力下降。"
  },
  microstructure_dislocation: {
    best: ["供应链/事件驱动 alpha", "尾部保护", "流动性优先执行"],
    avoid: ["短 gamma", "高换手拥挤交易"],
    note: "冲击周要优先识别传导链和流动性，而不是套用平稳期参数。"
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  initCache();
  const series = {};
  await pool(SYMBOLS, 4, async (symbol) => {
    series[symbol] = await fetchDaily(symbol);
    console.log(`${symbol.padEnd(5)} ${series[symbol].length} rows`);
  });

  validateSeries(series);

  const { rows, assetRegimes, assets, assetWeekCandles } = buildWeeklyRegimes(series);
  const dataThrough = rows.at(-1)?.weekEnd || null;
  let payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      requestedStart: formatDate(OUTPUT_START),
      requestedEnd: AS_OF,
      dataThrough,
      symbols: SYMBOLS,
      primaryProxy: "SPY",
      model: "rules-v1.2-transition-proxy",
      source: {
        vendor: "Massive + Financial Modeling Prep",
        endpoint: "Massive aggregates with FMP index/international fallback",
        docs: "https://massive.com/docs/rest/stocks/aggregates/custom-bars"
      },
      methodology: [
        "SPY daily bars are aggregated to calendar weeks using the last trading day as weekEnd.",
        "Market-level regime labels use the paper's taxonomy: return drift, realized volatility, correlation, VIX, equity-bond correlation, serial autocorrelation, and microstructure shock proxies.",
        "A TVTP-style transition proxy estimates off-diagonal switch pressure from weekly selloffs, high-volume down days, VIX stress, trend-efficiency collapse, and moving-average breaks.",
        "Sector and industry proxies are classified separately using each proxy's own trend, volatility, drawdown, serial autocorrelation, market-relative return, and correlation-to-SPY metrics.",
        "SOX is represented by SOXX as a liquid semiconductor proxy.",
        "Sector ETF pairwise rolling correlations approximate cross-asset correlation dynamics.",
        "TLT vs SPY rolling correlation and joint drawdowns flag stagflationary weeks.",
        "Labels are descriptive research annotations, not investment advice."
      ]
    },
    assets,
    assetRegimes,
    regimes: rows,
    regimeDefinitions: REGIMES,
    strategyMap: STRATEGIES,
    summary: {
      ...summarize(rows),
      assets: summarizeAssets(assetRegimes, rows)
    }
  };

  if (INCREMENTAL && PREVIOUS_PAYLOAD) {
    payload = mergeIncrementalPayload(PREVIOUS_PAYLOAD, payload);
  }

  saveRegimeRows(payload);

  await mkdir("data", { recursive: true });
  await mkdir("public/data", { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const candleJson = `${JSON.stringify(assetWeekCandles, null, 2)}\n`;
  await writeFile("data/regimes.json", json);
  await writeFile("public/data/regimes.json", json);
  await writeFile("public/local-preview-candles.json", candleJson);
  console.log(
    `Wrote data/regimes.json and public/data/regimes.json with ${payload.regimes.length} weekly regimes through ${payload.metadata.dataThrough}.`
  );
  console.log(
    `Wrote public/local-preview-candles.json with ${Object.keys(assetWeekCandles.candles || {}).length} asset candle strips through ${assetWeekCandles.weekEnd}.`
  );
  if (INCREMENTAL) {
    console.log(
      `Incremental mode: fetched from ${formatDate(FETCH_START)}, recalculated weeks from ${formatDate(OUTPUT_START)}.`
    );
  }
  if (SQLITE_ENABLED) {
    console.log(`SQLite cache: ${SQLITE_PATH}`);
  } else {
    console.log("SQLite cache unavailable; fetched directly.");
  }
}

async function fetchDaily(symbol) {
  if (FMP_PRIMARY_SYMBOLS.has(symbol)) {
    return fetchDailyFromFmp(symbol, "primary");
  }
  try {
    const rows = await fetchDailyFromMassive(symbol);
    if (rows.length) return rows;
  } catch (error) {
    console.warn(`Massive ${symbol} unavailable; using FMP fallback (${error.message.split("\n")[0]}).`);
  }
  return fetchDailyFromFmp(symbol, "fallback");
}

async function fetchDailyFromMassive(symbol) {
  const providerSymbol = toMassiveSymbol(symbol);
  const cacheKey = `massive|v1|${MASSIVE_CONFIG.baseUrl.origin}|${symbol}|${providerSymbol}|${formatDate(FETCH_START)}|${AS_OF}|aggs-1-day`;
  const cached = readProviderCache(cacheKey);
  if (cached) {
    return cached;
  }
  const response = await fetchMassiveAggregates(MASSIVE_CONFIG, {
    symbol,
    from: formatDate(FETCH_START),
    to: AS_OF
  });
  const rows = normalizeMassiveBars(symbol, response.results);
  writeProviderCache(cacheKey, symbol, providerSymbol, rows);
  return rows;
}

async function fetchDailyFromFmp(symbol, role) {
  const cacheKey = `fmp|v1|${symbol}|${formatDate(FETCH_START)}|${AS_OF}|historical-price-eod-full`;
  const cached = readProviderCache(cacheKey);
  if (cached) return cached;
  const rows = await fetchFmpDaily(FMP_CONFIG, { symbol, from: formatDate(FETCH_START), to: AS_OF });
  writeProviderCache(cacheKey, symbol, symbol, rows, `fmp-${role}`);
  return rows;
}

function validateSeries(series) {
  for (const symbol of ["SPY", "^VIX", "TLT", "QQQ", "IWM"]) {
    if (!series[symbol] || series[symbol].length < 260) {
      throw new Error(`${symbol} history is too short or unavailable.`);
    }
  }
}

function buildWeeklyRegimes(series) {
  const enriched = Object.fromEntries(Object.entries(series).map(([symbol, rows]) => [symbol, enrichDaily(rows || [])]));
  const spy = enriched.SPY;
  const vix = enriched["^VIX"];
  const tlt = enriched.TLT;
  const qqq = enriched.QQQ;
  const sectors = SECTOR_SYMBOLS.map((symbol) => [symbol, enriched[symbol] || []]).filter(([, rows]) => rows.length >= 260);
  const dateMaps = Object.fromEntries(
    Object.entries({ SPY: spy, VIX: vix, TLT: tlt, QQQ: qqq, ...Object.fromEntries(sectors) }).map(([symbol, rows]) => [
      symbol,
      new Map(rows.map((row) => [row.date, row]))
    ])
  );

  const weeks = buildCalendarWeeks(spy);
  const market = buildMarketRegimeRows({ spy, vix, tlt, qqq, sectors, dateMaps, weeks });
  const assets = ASSET_PROXIES.filter((proxy) => hasSufficientAssetHistory(proxy, enriched[proxy.symbol] || []));
  const assetRegimes = assets.map((proxy) => ({
    ...proxy,
    regimes: buildAssetRegimeRows(proxy, enriched[proxy.symbol], weeks, {
      spy,
      vix,
      tlt,
      marketContext: market.context
    })
  }));
  const assetWeekCandles = buildAssetWeekCandles(assets, enriched, market.rows.at(-1));

  return { rows: market.rows, assetRegimes, assets, assetWeekCandles };
}

function buildAssetWeekCandles(assets, enriched, latestWeek) {
  const candles = {};
  if (!latestWeek) {
    return { weekEnd: null, candles };
  }

  for (const proxy of assets) {
    const rows = enriched[proxy.symbol] || [];
    const bars = rows
      .filter((row) => row.date >= latestWeek.weekStart && row.date <= latestWeek.weekEnd)
      .sort((a, b) => a.time - b.time);
    if (!bars.length) continue;

    const first = bars[0];
    const last = bars.at(-1);
    candles[proxy.symbol] = {
      open: round(first.open, 2),
      high: round(Math.max(...bars.map((bar) => bar.high)), 2),
      low: round(Math.min(...bars.map((bar) => bar.low)), 2),
      close: round(last.close, 2),
      bars: bars.map((bar) => {
        const index = findIndexByDate(rows, bar.date);
        const previous = index > 0 ? rows[index - 1] : null;
        return {
          date: bar.date,
          open: round(bar.open, 2),
          high: round(bar.high, 2),
          low: round(bar.low, 2),
          close: round(bar.close, 2),
          previousClose: round(previous?.close, 2),
          dailyReturn: round(bar.dailyReturn, 5)
        };
      })
    };
  }

  return {
    weekStart: latestWeek.weekStart,
    weekEnd: latestWeek.weekEnd,
    candles
  };
}

function mergeIncrementalPayload(previous, next) {
  const replaceFrom = next.regimes[0]?.weekEnd;
  if (!replaceFrom) {
    return previous;
  }

  const regimes = [...(previous.regimes || []).filter((row) => row.weekEnd >= formatDate(FULL_OUTPUT_START) && row.weekEnd < replaceFrom), ...next.regimes]
    .sort((a, b) => parseDate(a.weekEnd) - parseDate(b.weekEnd));
  const previousAssets = new Map((previous.assetRegimes || []).map((asset) => [asset.symbol, asset]));
  const nextAssets = new Map((next.assetRegimes || []).map((asset) => [asset.symbol, asset]));
  const assetSymbols = [...new Set([...previousAssets.keys(), ...nextAssets.keys()])];
  const assetRegimes = assetSymbols
    .map((symbol) => {
      const previousAsset = previousAssets.get(symbol);
      const nextAsset = nextAssets.get(symbol);
      if (!nextAsset) {
        return previousAsset
          ? {
              ...previousAsset,
              regimes: previousAsset.regimes.filter((row) => row.weekEnd >= formatDate(FULL_OUTPUT_START))
            }
          : null;
      }

      return {
        ...previousAsset,
        ...nextAsset,
        regimes: [
          ...(previousAsset?.regimes || []).filter((row) => row.weekEnd >= formatDate(FULL_OUTPUT_START) && row.weekEnd < replaceFrom),
          ...(nextAsset.regimes || [])
        ].sort((a, b) => parseDate(a.weekEnd) - parseDate(b.weekEnd))
      };
    })
    .filter(Boolean);

  const assets = next.assets?.length ? next.assets : previous.assets || [];
  return {
    ...next,
    metadata: {
      ...next.metadata,
      requestedStart: formatDate(FULL_OUTPUT_START),
      dataThrough: regimes.at(-1)?.weekEnd || next.metadata.dataThrough
    },
    assets,
    assetRegimes,
    regimes,
    summary: {
      ...summarize(regimes),
      assets: summarizeAssets(assetRegimes, regimes)
    }
  };
}

function hasSufficientAssetHistory(proxy, rows) {
  const minimumRows = proxy.group === "Custom" ? 20 : 260;
  return rows.length >= minimumRows;
}

function buildCalendarWeeks(spy) {
  const grouped = new Map();
  for (const bar of spy) {
    if (bar.time < OUTPUT_START.getTime() || bar.time > OUTPUT_END.getTime()) continue;
    const key = formatDate(startOfWeek(parseDate(bar.date)));
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(bar);
  }

  return [...grouped.entries()]
    .map(([weekStart, bars]) => {
      const sorted = bars.sort((a, b) => a.time - b.time);
      const first = sorted[0];
      const last = sorted.at(-1);
      return {
        weekStart,
        weekEnd: last.date,
        open: first.open,
        high: Math.max(...sorted.map((bar) => bar.high)),
        low: Math.min(...sorted.map((bar) => bar.low)),
        close: last.close,
        volume: sum(sorted.map((bar) => bar.volume)),
        bars: sorted
      };
    })
    .sort((a, b) => parseDate(a.weekStart) - parseDate(b.weekStart));
}

function buildMarketRegimeRows({ spy, vix, tlt, qqq, sectors, dateMaps, weeks }) {
  const weeklyVolumes = [];
  const output = [];
  const context = new Map();

  for (const week of weeks) {
    const endIndex = findIndexByDate(spy, week.weekEnd);
    const end = spy[endIndex];
    const priorWeek = output.at(-1);
    const previousClose = priorWeek?.metrics.spyClose ?? closeAgo(spy, endIndex, 5) ?? week.open;
    const weeklyReturn = week.close / previousClose - 1;
    weeklyVolumes.push(week.volume);

    const vixRow = nearestOnOrBefore(vix, week.weekEnd);
    const tltRow = nearestOnOrBefore(tlt, week.weekEnd);
    const qqqRow = nearestOnOrBefore(qqq, week.weekEnd);

    const shock = weeklyShockMetrics(week.bars, spy);
    const metrics = {
      spyOpen: round(week.open, 2),
      spyHigh: round(week.high, 2),
      spyLow: round(week.low, 2),
      spyClose: round(week.close, 2),
      weeklyReturn: round(weeklyReturn, 5),
      ret4w: round(returnAgo(spy, endIndex, 20), 5),
      ret13w: round(returnAgo(spy, endIndex, 63), 5),
      ret26w: round(returnAgo(spy, endIndex, 126), 5),
      qqq13w: round(rowReturnAgo(qqq, qqqRow?.date, 63), 5),
      tlt13w: round(rowReturnAgo(tlt, tltRow?.date, 63), 5),
      vixClose: round(vixRow?.close, 2),
      vix4wChange: round(rowCloseChangeAgo(vix, vixRow?.date, 20), 2),
      realizedVol20: round(realizedVol(spy, endIndex, 20), 4),
      realizedVol63: round(realizedVol(spy, endIndex, 63), 4),
      sectorCorrelation20: round(averageSectorCorrelation(sectors, dateMaps, week.weekEnd, 20), 4),
      equityBondCorrelation63: round(rollingCorrelation(spy, tlt, week.weekEnd, 63), 4),
      serialAutocorr20: round(serialAutocorrelation(spy, endIndex, 20), 4),
      trendEfficiency20: round(trendEfficiency(spy, endIndex, 20), 4),
      weekRange: round(week.high / week.low - 1, 5),
      maxAbsDailyReturn: round(Math.max(...week.bars.map((bar) => Math.abs(bar.dailyReturn || 0))), 5),
      maxDownDailyReturn: shock.maxDownDailyReturn,
      maxOpenGap: round(maxOpenGap(week.bars, spy, endIndex), 5),
      volumeZ13w: round(zScore(weeklyVolumes, 13), 4),
      downVolumeZ20: shock.downVolumeZ20,
      downVolumeZ63: shock.downVolumeZ63,
      distributionDay: shock.distributionDay,
      distributionDate: shock.distributionDate,
      shockDownDay: shock.shockDownDay,
      drawdown52w: round(drawdownFromHigh(spy, endIndex, 252), 5),
      aboveMa50: end.close > sma(spy, endIndex, 50),
      aboveMa200: end.close > sma(spy, endIndex, 200),
      qqqLeadership13w: round((rowReturnAgo(qqq, qqqRow?.date, 63) || 0) - (returnAgo(spy, endIndex, 63) || 0), 5),
      sectorDispersion4w: round(sectorDispersion(sectors, week.weekEnd, 20), 5)
    };

    const classification = classify(metrics, "SPY");
    const def = REGIMES[classification.code];
    const row = {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      code: classification.code,
      baselineCode: classification.baselineCode,
      baselineLabelZh: classification.baselineLabelZh,
      order: def.order,
      label: def.label,
      labelZh: def.labelZh,
      family: def.family,
      confidence: classification.confidence,
      scores: classification.scores,
      transition: classification.transition,
      metrics,
      drivers: classification.drivers,
      thesis: def.thesis,
      strategies: STRATEGIES[classification.code]
    };
    output.push(row);
    context.set(week.weekEnd, {
      marketCode: row.code,
      marketLabelZh: row.labelZh,
      spyRet13w: metrics.ret13w,
      vixClose: metrics.vixClose,
      vix4wChange: metrics.vix4wChange,
      tlt13w: metrics.tlt13w,
      sectorCorrelation20: metrics.sectorCorrelation20,
      equityBondCorrelation63: metrics.equityBondCorrelation63,
      sectorDispersion4w: metrics.sectorDispersion4w
    });
  }

  return { rows: output, context };
}

function buildAssetRegimeRows(proxy, rows, weeks, { spy, vix, tlt, marketContext }) {
  const weeklyVolumes = [];
  const output = [];

  for (const week of weeks) {
    const bars = rows.filter((row) => row.date >= week.weekStart && row.date <= week.weekEnd);
    if (!bars.length) continue;

    const sorted = bars.sort((a, b) => a.time - b.time);
    const first = sorted[0];
    const last = sorted.at(-1);
    const endIndex = findIndexByDate(rows, last.date);
    if (endIndex < 0) continue;

    const previousClose = output.at(-1)?.metrics.close ?? closeAgo(rows, endIndex, 5) ?? first.open;
    const weeklyReturn = last.close / previousClose - 1;
    const vixRow = nearestOnOrBefore(vix, week.weekEnd);
    const tltRow = nearestOnOrBefore(tlt, week.weekEnd);
    const spyRow = nearestOnOrBefore(spy, week.weekEnd);
    const spyIndex = spyRow ? findIndexByDate(spy, spyRow.date) : -1;
    const ret13 = returnAgo(rows, endIndex, 63);
    const spyRet13 = spyIndex >= 0 ? returnAgo(spy, spyIndex, 63) : marketContext.get(week.weekEnd)?.spyRet13w;
    const relativeToSpy13w = Number.isFinite(ret13) && Number.isFinite(spyRet13) ? ret13 - spyRet13 : null;
    const market = marketContext.get(week.weekEnd) || {};
    weeklyVolumes.push(sum(sorted.map((bar) => bar.volume)));

    const correlationToSpy63 = rollingCorrelation(rows, spy, week.weekEnd, 63);
    const shock = weeklyShockMetrics(sorted, rows);
    const metrics = {
      close: round(last.close, 2),
      weeklyReturn: round(weeklyReturn, 5),
      ret4w: round(returnAgo(rows, endIndex, 20), 5),
      ret13w: round(ret13, 5),
      ret26w: round(returnAgo(rows, endIndex, 126), 5),
      spyRet13w: round(spyRet13, 5),
      relativeToSpy13w: round(relativeToSpy13w, 5),
      tlt13w: round(rowReturnAgo(tlt, tltRow?.date, 63), 5),
      vixClose: round(vixRow?.close ?? market.vixClose, 2),
      vix4wChange: round(rowCloseChangeAgo(vix, vixRow?.date, 20) ?? market.vix4wChange, 2),
      realizedVol20: round(realizedVol(rows, endIndex, 20), 4),
      realizedVol63: round(realizedVol(rows, endIndex, 63), 4),
      sectorCorrelation20: round(correlationToSpy63 ?? market.sectorCorrelation20, 4),
      correlationToSpy63: round(correlationToSpy63, 4),
      equityBondCorrelation63: round(market.equityBondCorrelation63, 4),
      serialAutocorr20: round(serialAutocorrelation(rows, endIndex, 20), 4),
      trendEfficiency20: round(trendEfficiency(rows, endIndex, 20), 4),
      weekRange: round(Math.max(...sorted.map((bar) => bar.high)) / Math.min(...sorted.map((bar) => bar.low)) - 1, 5),
      maxAbsDailyReturn: round(Math.max(...sorted.map((bar) => Math.abs(bar.dailyReturn || 0))), 5),
      maxDownDailyReturn: shock.maxDownDailyReturn,
      maxOpenGap: round(maxOpenGap(sorted, rows, endIndex), 5),
      volumeZ13w: round(zScore(weeklyVolumes, 13), 4),
      downVolumeZ20: shock.downVolumeZ20,
      downVolumeZ63: shock.downVolumeZ63,
      distributionDay: shock.distributionDay,
      distributionDate: shock.distributionDate,
      shockDownDay: shock.shockDownDay,
      drawdown52w: round(drawdownFromHigh(rows, endIndex, 252), 5),
      aboveMa50: last.close > sma(rows, endIndex, 50),
      aboveMa200: last.close > sma(rows, endIndex, 200),
      qqqLeadership13w: round(relativeToSpy13w, 5),
      sectorDispersion4w: round(market.sectorDispersion4w, 5),
      marketCode: market.marketCode,
      marketLabelZh: market.marketLabelZh
    };

    const classification = classify(metrics, proxy.displaySymbol);
    const def = REGIMES[classification.code];
    output.push({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      symbol: proxy.symbol,
      displaySymbol: proxy.displaySymbol,
      name: proxy.name,
      group: proxy.group,
      code: classification.code,
      baselineCode: classification.baselineCode,
      baselineLabelZh: classification.baselineLabelZh,
      order: def.order,
      label: def.label,
      labelZh: def.labelZh,
      family: def.family,
      confidence: classification.confidence,
      scores: classification.scores,
      transition: classification.transition,
      metrics,
      drivers: classification.drivers,
      thesis: def.thesis
    });
  }

  return output;
}

function classify(m, targetLabel = "SPY") {
  const ranked = rankRegimeScores(m);
  const [baselineCode, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const baselineConfidence = round(Math.max(0.45, Math.min(0.96, 0.52 + (top - second) / 2.8)), 2);
  const transition = computeTransitionProxy(m, baselineCode);
  const code = transition.switched ? transition.likelyNext : baselineCode;
  const confidence = transition.switched
    ? round(Math.max(0.55, Math.min(0.92, 0.55 + transition.pressure / 250)), 2)
    : baselineConfidence;
  const transitionDrivers = transition.pressure >= 50 ? transition.triggers.slice(0, 3) : [];

  return {
    code,
    baselineCode,
    baselineLabelZh: REGIMES[baselineCode].labelZh,
    confidence,
    scores: Object.fromEntries(ranked.slice(0, 5)),
    transition,
    drivers: [...transitionDrivers, ...buildDrivers(code, m, targetLabel)].slice(0, 4)
  };
}

function rankRegimeScores(m) {
  const vix = m.vixClose ?? 18;
  const rv = m.realizedVol20 ?? 0.16;
  const corr = m.sectorCorrelation20 ?? 0.45;
  const ebCorr = m.equityBondCorrelation63 ?? 0;
  const weekly = m.weeklyReturn ?? 0;
  const ret13 = m.ret13w ?? 0;
  const ret4 = m.ret4w ?? 0;
  const qLead = m.qqqLeadership13w ?? 0;
  const tlt13 = m.tlt13w ?? 0;
  const volZ = m.volumeZ13w ?? 0;
  const downVolZ = m.downVolumeZ20 ?? 0;
  const serial = m.serialAutocorr20 ?? 0;
  const efficiency = m.trendEfficiency20 ?? 0;
  const range = m.weekRange ?? 0;
  const maxDaily = m.maxAbsDailyReturn ?? 0;
  const maxDown = -(m.maxDownDailyReturn ?? 0);
  const gap = m.maxOpenGap ?? 0;

  const scores = {
    microstructure_dislocation:
      1.25 * scale(maxDaily, 0.035, 0.075) +
      1.05 * scale(range, 0.06, 0.12) +
      0.9 * scale(vix, 30, 45) +
      0.55 * scale(Math.abs(m.vix4wChange || 0), 7, 20) +
      0.45 * scale(volZ, 1.4, 3.5) +
      0.35 * scale(gap, 0.018, 0.05),
    stagflationary:
      1.05 * scale(-ret13, 0.03, 0.13) +
      1.05 * scale(-tlt13, 0.02, 0.09) +
      1.0 * scale(ebCorr, 0.15, 0.55) +
      0.45 * scale(vix, 18, 30) +
      0.35 * scale(rv, 0.16, 0.3),
    trend_accelerating:
      1.1 * scale(ret13, 0.055, 0.18) +
      0.9 * scale(ret4, 0.018, 0.075) +
      0.65 * scale(serial, 0.04, 0.24) +
      0.55 * scale(efficiency, 0.45, 0.78) +
      0.45 * scale(qLead, 0.015, 0.1) +
      (m.aboveMa50 ? 0.35 : 0) +
      (m.aboveMa200 ? 0.25 : 0) -
      0.35 * scale(vix, 25, 36),
    mean_reverting:
      0.95 * (ret13 * ret4 < 0 ? scale(Math.abs(ret4), 0.012, 0.07) : 0) +
      0.8 * scale(-serial, 0.05, 0.28) +
      0.65 * scale(1 - efficiency, 0.45, 0.82) +
      0.55 * scale(rv, 0.18, 0.35) +
      0.45 * scale(Math.abs(ret13), 0.06, 0.16),
    bear_volatile:
      1.05 * scale(-ret13, 0.05, 0.16) +
      0.9 * scale(vix, 23, 36) +
      0.75 * scale(rv, 0.2, 0.36) +
      0.55 * scale(corr, 0.55, 0.78) +
      0.45 * scale(-ret4, 0.015, 0.08),
    bull_volatile:
      1.0 * scale(ret13, 0.045, 0.16) +
      0.85 * scale(vix, 19, 32) +
      0.7 * scale(rv, 0.19, 0.34) +
      0.45 * scale(corr, 0.5, 0.72) +
      0.35 * scale(range, 0.04, 0.085) +
      0.55 * scale(-weekly, 0.015, 0.045) +
      0.45 * scale(downVolZ, 1.5, 5),
    sideways_volatile:
      1.05 * scale(0.055 - Math.abs(ret13), 0, 0.055) +
      0.85 * scale(vix, 19, 31) +
      0.75 * scale(rv, 0.18, 0.32) +
      0.55 * scale(1 - efficiency, 0.45, 0.85) +
      0.35 * scale(range, 0.04, 0.08) +
      0.45 * scale(-weekly, 0.015, 0.045) +
      0.4 * scale(downVolZ, 1.5, 5),
    bull_quiet:
      1.05 * scale(ret13, 0.035, 0.13) +
      0.85 * scale(19 - vix, 0, 8) +
      0.75 * scale(0.2 - rv, 0, 0.12) +
      0.45 * scale(0.58 - corr, 0, 0.3) +
      (m.aboveMa50 ? 0.2 : 0) -
      0.65 * scale(vix, 20, 25) -
      0.55 * scale(-weekly, 0.015, 0.04) -
      0.45 * scale(downVolZ, 2, 5),
    bear_quiet:
      1.05 * scale(-ret13, 0.035, 0.13) +
      0.7 * scale(24 - vix, 0, 10) +
      0.6 * scale(0.24 - rv, 0, 0.14) +
      0.35 * scale(-ret4, 0, 0.055),
    sideways_quiet:
      1.1 * scale(0.045 - Math.abs(ret13), 0, 0.045) +
      0.9 * scale(18 - vix, 0, 8) +
      0.85 * scale(0.18 - rv, 0, 0.11) +
      0.45 * scale(0.6 - corr, 0, 0.35)
  };

  if (scores.microstructure_dislocation < 1.45 || (vix < 28 && maxDaily < 0.035 && range < 0.065)) {
    scores.microstructure_dislocation *= 0.45;
  }
  if (scores.stagflationary < 2.0 || !(ret13 < -0.015 && tlt13 < -0.01 && ebCorr > 0.08)) {
    scores.stagflationary *= 0.55;
  }
  if (scores.trend_accelerating < 2.0 || ret13 < 0.035 || ret4 < -0.005) {
    scores.trend_accelerating *= 0.55;
  }
  if (scores.mean_reverting < 1.8 || (rv < 0.18 && vix < 19)) {
    scores.mean_reverting *= 0.65;
  }
  if (scores.bull_quiet > 0 && (vix >= 20 || weekly <= -0.02 || maxDown >= 0.02 || m.distributionDay)) {
    scores.bull_quiet *= 0.72;
  }

  return Object.entries(scores)
    .map(([code, score]) => [code, round(score, 4)])
    .sort((a, b) => b[1] - a[1]);
}

function computeTransitionProxy(m, baselineCode) {
  const vix = m.vixClose ?? 18;
  const weekly = m.weeklyReturn ?? 0;
  const ret13 = m.ret13w ?? 0;
  const ret4 = m.ret4w ?? 0;
  const rv = m.realizedVol20 ?? 0.16;
  const efficiency = m.trendEfficiency20 ?? 0.35;
  const downVolZ = m.downVolumeZ20 ?? 0;
  const maxDown = -(m.maxDownDailyReturn ?? 0);
  const pressure = round(Math.min(100,
    22 * scale(-weekly, 0.015, 0.045) +
    24 * scale(downVolZ, 1.5, 5) +
    18 * scale(vix, 19, 25) +
    10 * scale(m.vix4wChange ?? 0, 3, 10) +
    14 * scale(0.25 - efficiency, 0, 0.25) +
    12 * scale(maxDown, 0.015, 0.035) +
    8 * (m.distributionDay ? 1 : 0) +
    8 * (weekly <= -0.02 ? 1 : 0) +
    8 * (vix >= 20 ? 1 : 0) +
    10 * (!m.aboveMa50 ? 1 : 0) +
    10 * (!m.aboveMa200 ? 1 : 0)
  ), 1);

  const probabilities = transitionProbabilities({
    baselineCode,
    pressure,
    vix,
    weekly,
    ret13,
    ret4,
    rv,
    efficiency,
    downVolZ,
    maxDown,
    aboveMa50: m.aboveMa50,
    aboveMa200: m.aboveMa200,
    distributionDay: m.distributionDay
  });
  const likelyNext = Object.entries(probabilities)
    .filter(([code]) => code !== baselineCode)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? baselineCode;
  const likelyNextProbability = probabilities[likelyNext] ?? 0;
  const switched = pressure >= 65 && likelyNext !== baselineCode && likelyNextProbability >= 0.35;

  return {
    pressure,
    status: pressure >= 65 ? "switch" : pressure >= 45 ? "watch" : "stable",
    from: baselineCode,
    likelyNext,
    likelyNextLabelZh: REGIMES[likelyNext]?.labelZh,
    switched,
    probabilities,
    triggers: transitionTriggers(m)
  };
}

function transitionProbabilities(inputs) {
  const {
    baselineCode,
    pressure,
    vix,
    weekly,
    ret13,
    ret4,
    rv,
    efficiency,
    downVolZ,
    maxDown,
    aboveMa50,
    aboveMa200,
    distributionDay
  } = inputs;
  const stayWeight = Math.max(0.22, 1.45 - pressure / 58);
  const bullVolatile =
    0.35 +
    0.55 * scale(ret13, 0.035, 0.13) +
    0.45 * scale(vix, 19, 25) +
    0.35 * scale(-weekly, 0.015, 0.045) +
    0.25 * scale(downVolZ, 1.5, 5) +
    0.2 * (distributionDay ? 1 : 0);
  const sidewaysVolatile =
    0.3 +
    0.45 * scale(0.025 - Math.abs(ret4), 0, 0.025) +
    0.45 * scale(0.3 - efficiency, 0, 0.3) +
    0.35 * scale(-weekly, 0.015, 0.045) +
    0.25 * scale(vix, 20, 25);
  const bearVolatile =
    0.12 +
    0.55 * scale(-ret13, 0.015, 0.09) +
    0.5 * scale(vix, 24, 32) +
    0.45 * scale(rv, 0.2, 0.35) +
    0.35 * scale(maxDown, 0.025, 0.05) +
    0.3 * (!aboveMa50 ? 1 : 0) +
    0.3 * (!aboveMa200 ? 1 : 0);

  const candidates = new Map([[baselineCode, stayWeight]]);
  const addCandidate = (code, value) => {
    if (code !== baselineCode) {
      candidates.set(code, value);
    }
  };
  addCandidate("bull_volatile", bullVolatile);
  addCandidate("sideways_volatile", sidewaysVolatile);
  addCandidate("bear_volatile", bearVolatile);
  if (ret13 < -0.015 && aboveMa50 === false && vix < 24) {
    addCandidate("bear_quiet", 0.3 + 0.5 * scale(-ret13, 0.02, 0.12));
  }
  const total = sum([...candidates.values()]);
  return Object.fromEntries(
    [...candidates.entries()]
      .map(([code, value]) => [code, round(value / total, 4)])
      .sort((a, b) => b[1] - a[1])
  );
}

function transitionTriggers(m) {
  const triggers = [];
  if ((m.weeklyReturn ?? 0) <= -0.02) triggers.push(`SPY weekly selloff ${pct(m.weeklyReturn)}`);
  if ((m.maxDownDailyReturn ?? 0) <= -0.02) triggers.push(`single-day drop ${pct(m.maxDownDailyReturn)}`);
  if ((m.downVolumeZ20 ?? 0) >= 2) triggers.push(`high-volume down day z=${round(m.downVolumeZ20, 1)}`);
  if ((m.vixClose ?? 0) >= 20) triggers.push(`VIX crossed ${round(m.vixClose, 1)}`);
  if ((m.trendEfficiency20 ?? 1) <= 0.08) triggers.push(`20D trend efficiency ${round(m.trendEfficiency20, 2)}`);
  if (m.aboveMa50 === false) triggers.push("below MA50");
  if (m.aboveMa200 === false) triggers.push("below MA200");
  return triggers.slice(0, 6);
}

function buildDrivers(code, m, targetLabel = "SPY") {
  const drivers = [];
  if (code.includes("bull") || code === "trend_accelerating") drivers.push(`13 周 ${targetLabel} 收益 ${pct(m.ret13w || 0)}`);
  if (code.includes("bear") || code === "stagflationary") drivers.push(`13 周 ${targetLabel} 收益 ${pct(m.ret13w || 0)}`);
  if (code.includes("volatile") || code === "microstructure_dislocation" || code === "mean_reverting") {
    drivers.push(`20 日实现波动 ${pct(m.realizedVol20 || 0)}`);
  }
  if (code.includes("quiet") || code === "sideways_quiet") drivers.push(`VIX ${round(m.vixClose || 0, 1)}`);
  if (code === "stagflationary") drivers.push(`TLT 13 周 ${pct(m.tlt13w || 0)}`, `股债相关 ${round(m.equityBondCorrelation63 || 0, 2)}`);
  if (code === "microstructure_dislocation") drivers.push(`周内最大日波动 ${pct(m.maxAbsDailyReturn || 0)}`, `周振幅 ${pct(m.weekRange || 0)}`);
  if (code === "trend_accelerating") drivers.push(`20 日趋势效率 ${round(m.trendEfficiency20 || 0, 2)}`, `${targetLabel === "SPY" ? "QQQ" : targetLabel} 相对 SPY ${pct(m.qqqLeadership13w || 0)}`);
  if (code === "mean_reverting") drivers.push(`20 日自相关 ${round(m.serialAutocorr20 || 0, 2)}`);
  if (drivers.length < 3) drivers.push(`行业相关 ${round(m.sectorCorrelation20 || 0, 2)}`);
  return drivers.slice(0, 4);
}

function enrichDaily(rows) {
  return rows.map((row, index) => ({
    ...row,
    dailyReturn: index > 0 ? row.close / rows[index - 1].close - 1 : null,
    range: row.high / row.low - 1
  }));
}

function weeklyShockMetrics(weekBars, rows) {
  const downBars = weekBars
    .map((bar) => {
      const index = findIndexByDate(rows, bar.date);
      return {
        date: bar.date,
        dailyReturn: bar.dailyReturn,
        volumeZ20: index >= 0 ? dailyVolumeZ(rows, index, 20) : 0,
        volumeZ63: index >= 0 ? dailyVolumeZ(rows, index, 63) : 0
      };
    })
    .filter((bar) => Number.isFinite(bar.dailyReturn) && bar.dailyReturn < 0);
  const worstDown = downBars.sort((a, b) => a.dailyReturn - b.dailyReturn)[0];
  const highestVolumeDown = downBars.sort((a, b) => b.volumeZ20 - a.volumeZ20)[0];
  const distribution = downBars.find((bar) => bar.dailyReturn <= -0.015 && bar.volumeZ20 >= 2);

  return {
    maxDownDailyReturn: round(worstDown?.dailyReturn ?? 0, 5),
    downVolumeZ20: round(highestVolumeDown?.volumeZ20 ?? 0, 4),
    downVolumeZ63: round(highestVolumeDown?.volumeZ63 ?? 0, 4),
    distributionDay: Boolean(distribution),
    distributionDate: distribution?.date ?? null,
    shockDownDay: Boolean(worstDown && worstDown.dailyReturn <= -0.02)
  };
}

function summarize(rows) {
  const byRegime = {};
  for (const row of rows) {
    byRegime[row.code] ??= {
      code: row.code,
      label: row.label,
      labelZh: row.labelZh,
      count: 0,
      avgWeeklyReturn: 0,
      avgVol: 0
    };
    byRegime[row.code].count += 1;
    byRegime[row.code].avgWeeklyReturn += row.metrics.weeklyReturn || 0;
    byRegime[row.code].avgVol += row.metrics.realizedVol20 || 0;
  }
  for (const item of Object.values(byRegime)) {
    item.avgWeeklyReturn = round(item.avgWeeklyReturn / item.count, 5);
    item.avgVol = round(item.avgVol / item.count, 4);
  }
  return {
    weeks: rows.length,
    latest: rows.at(-1) || null,
    byRegime: Object.values(byRegime).sort((a, b) => REGIMES[a.code].order - REGIMES[b.code].order)
  };
}

function summarizeAssets(assetRegimes, marketRows) {
  const latestMarket = marketRows.at(-1);
  const latest = assetRegimes
    .map((asset) => {
      const row = asset.regimes.at(-1);
      return row
        ? {
            symbol: asset.symbol,
            displaySymbol: asset.displaySymbol,
            name: asset.name,
            group: asset.group,
            code: row.code,
            label: row.label,
            labelZh: row.labelZh,
            confidence: row.confidence,
            weeklyReturn: row.metrics.weeklyReturn,
            ret13w: row.metrics.ret13w,
            relativeToSpy13w: row.metrics.relativeToSpy13w,
            realizedVol20: row.metrics.realizedVol20,
            divergentFromMarket: latestMarket ? row.code !== latestMarket.code : false
          }
        : null;
    })
    .filter(Boolean);

  const byLatestRegime = {};
  for (const item of latest) {
    byLatestRegime[item.code] ??= {
      code: item.code,
      label: item.label,
      labelZh: item.labelZh,
      count: 0
    };
    byLatestRegime[item.code].count += 1;
  }

  return {
    count: assetRegimes.length,
    latest,
    byLatestRegime: Object.values(byLatestRegime).sort((a, b) => REGIMES[a.code].order - REGIMES[b.code].order),
    divergences: latest
      .filter((item) => item.divergentFromMarket && item.symbol !== "SPY")
      .sort((a, b) => Math.abs(b.relativeToSpy13w || 0) - Math.abs(a.relativeToSpy13w || 0))
      .slice(0, 8)
  };
}

async function pool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function averageSectorCorrelation(sectors, dateMaps, endDate, window) {
  const symbols = sectors.map(([symbol]) => symbol);
  const values = [];
  for (let i = 0; i < symbols.length; i += 1) {
    for (let j = i + 1; j < symbols.length; j += 1) {
      const corr = pairCorrelation(dateMaps[symbols[i]], dateMaps[symbols[j]], endDate, window);
      if (Number.isFinite(corr)) values.push(corr);
    }
  }
  return values.length ? average(values) : null;
}

function pairCorrelation(mapA, mapB, endDate, window) {
  const dates = [...mapA.keys()].filter((date) => date <= endDate && mapB.has(date)).slice(-window);
  const a = [];
  const b = [];
  for (const date of dates) {
    const ra = mapA.get(date)?.dailyReturn;
    const rb = mapB.get(date)?.dailyReturn;
    if (Number.isFinite(ra) && Number.isFinite(rb)) {
      a.push(ra);
      b.push(rb);
    }
  }
  return a.length >= Math.max(10, Math.floor(window * 0.6)) ? correlation(a, b) : null;
}

function rollingCorrelation(rowsA, rowsB, endDate, window) {
  const mapB = new Map(rowsB.map((row) => [row.date, row]));
  const dates = rowsA.filter((row) => row.date <= endDate && mapB.has(row.date)).slice(-window);
  const a = [];
  const b = [];
  for (const row of dates) {
    const rb = mapB.get(row.date)?.dailyReturn;
    if (Number.isFinite(row.dailyReturn) && Number.isFinite(rb)) {
      a.push(row.dailyReturn);
      b.push(rb);
    }
  }
  return a.length >= Math.max(20, Math.floor(window * 0.6)) ? correlation(a, b) : null;
}

function serialAutocorrelation(rows, index, window) {
  const slice = rows.slice(Math.max(0, index - window + 1), index + 1).map((row) => row.dailyReturn).filter(Number.isFinite);
  if (slice.length < 10) return null;
  return correlation(slice.slice(1), slice.slice(0, -1));
}

function trendEfficiency(rows, index, window) {
  const slice = rows.slice(Math.max(0, index - window + 1), index + 1);
  if (slice.length < 5) return null;
  const totalMove = Math.abs(slice.at(-1).close / slice[0].close - 1);
  const path = sum(slice.slice(1).map((row, i) => Math.abs(row.close / slice[i].close - 1)));
  return path > 0 ? totalMove / path : 0;
}

function realizedVol(rows, index, window) {
  const returns = rows.slice(Math.max(0, index - window + 1), index + 1).map((row) => row.dailyReturn).filter(Number.isFinite);
  return returns.length > 5 ? stddev(returns) * Math.sqrt(252) : null;
}

function sectorDispersion(sectors, endDate, window) {
  const values = sectors
    .map(([, rows]) => {
      const row = nearestOnOrBefore(rows, endDate);
      return row ? rowReturnAgo(rows, row.date, window) : null;
    })
    .filter(Number.isFinite);
  return values.length > 4 ? stddev(values) : null;
}

function maxOpenGap(weekBars, spy, endIndex) {
  const indexByDate = new Map(spy.map((row, index) => [row.date, index]));
  let maxGap = 0;
  for (const bar of weekBars) {
    const i = indexByDate.get(bar.date);
    if (i > 0) {
      maxGap = Math.max(maxGap, Math.abs(bar.open / spy[i - 1].close - 1));
    }
  }
  return maxGap;
}

function drawdownFromHigh(rows, index, window) {
  const slice = rows.slice(Math.max(0, index - window + 1), index + 1);
  const high = Math.max(...slice.map((row) => row.close));
  return rows[index].close / high - 1;
}

function returnAgo(rows, index, days) {
  const prior = closeAgo(rows, index, days);
  return prior ? rows[index].close / prior - 1 : null;
}

function rowReturnAgo(rows, date, days) {
  if (!date) return null;
  const index = findIndexByDate(rows, date);
  return index >= 0 ? returnAgo(rows, index, days) : null;
}

function rowCloseChangeAgo(rows, date, days) {
  if (!date) return null;
  const index = findIndexByDate(rows, date);
  const prior = closeAgo(rows, index, days);
  return prior ? rows[index].close - prior : null;
}

function closeAgo(rows, index, days) {
  const prior = index - days;
  return prior >= 0 ? rows[prior].close : null;
}

function findIndexByDate(rows, date) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].date === date) return mid;
    if (rows[mid].date < date) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

function nearestOnOrBefore(rows, date) {
  const index = findIndexByDate(rows, date);
  return index >= 0 ? rows[index] : null;
}

function sma(rows, index, window) {
  const slice = rows.slice(Math.max(0, index - window + 1), index + 1);
  return average(slice.map((row) => row.close));
}

function zScore(values, window) {
  const slice = values.slice(-window);
  if (slice.length < 4) return 0;
  const prior = slice.slice(0, -1);
  const sd = stddev(prior);
  return sd > 0 ? (slice.at(-1) - average(prior)) / sd : 0;
}

function dailyVolumeZ(rows, index, window) {
  const prior = rows.slice(Math.max(0, index - window), index).map((row) => row.volume).filter(Number.isFinite);
  if (prior.length < 4) return 0;
  const sd = stddev(prior);
  return sd > 0 ? (rows[index].volume - average(prior)) / sd : 0;
}

function correlation(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = average(a);
  const mb = average(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}

function stddev(values) {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? sum(clean) / clean.length : null;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function scale(value, low, high) {
  if (!Number.isFinite(value) || high === low) return 0;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function parseDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY);
}

function addYears(date, years) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function maxDate(a, b) {
  return a.getTime() >= b.getTime() ? a : b;
}

function startOfWeek(date) {
  const day = date.getUTCDay() || 7;
  return addDays(date, 1 - day);
}

function readPreviousPayload(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function initCache() {
  if (!SQLITE_ENABLED) return;
  mkdirSync(dirname(SQLITE_PATH), { recursive: true });
  sqliteExec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS provider_cache (
      cache_key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      symbol TEXT NOT NULL,
      provider_symbol TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      response_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS regime_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      requested_start TEXT NOT NULL,
      requested_end TEXT NOT NULL,
      data_through TEXT,
      payload_json TEXT NOT NULL
    );
	    CREATE TABLE IF NOT EXISTS weekly_regimes (
	      week_end TEXT PRIMARY KEY,
	      week_start TEXT NOT NULL,
	      code TEXT NOT NULL,
	      label TEXT NOT NULL,
      label_zh TEXT NOT NULL,
      confidence REAL NOT NULL,
	      row_json TEXT NOT NULL,
	      generated_at TEXT NOT NULL
	    );
	    CREATE TABLE IF NOT EXISTS asset_weekly_regimes (
	      symbol TEXT NOT NULL,
	      display_symbol TEXT NOT NULL,
	      name TEXT NOT NULL,
	      group_name TEXT NOT NULL,
	      week_end TEXT NOT NULL,
	      week_start TEXT NOT NULL,
	      code TEXT NOT NULL,
	      label TEXT NOT NULL,
	      label_zh TEXT NOT NULL,
	      confidence REAL NOT NULL,
	      row_json TEXT NOT NULL,
	      generated_at TEXT NOT NULL,
	      PRIMARY KEY (symbol, week_end)
	    );
	  `);
}

function readProviderCache(cacheKey) {
  if (!SQLITE_ENABLED || REFRESH) return null;
  const rows = sqliteJson(`SELECT response_json FROM provider_cache WHERE cache_key = ${sqlString(cacheKey)} LIMIT 1;`);
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].response_json);
  } catch {
    return null;
  }
}

function writeProviderCache(cacheKey, symbol, providerSymbol, rows, provider = "massive") {
  if (!SQLITE_ENABLED) return;
  sqliteExec(`
    INSERT INTO provider_cache (cache_key, provider, symbol, provider_symbol, from_date, to_date, response_json, fetched_at)
    VALUES (
      ${sqlString(cacheKey)},
      ${sqlString(provider)},
      ${sqlString(symbol)},
      ${sqlString(providerSymbol)},
      ${sqlString(formatDate(FETCH_START))},
      ${sqlString(AS_OF)},
      ${sqlString(JSON.stringify(rows))},
      ${sqlString(new Date().toISOString())}
    )
    ON CONFLICT(cache_key) DO UPDATE SET
      response_json = excluded.response_json,
      fetched_at = excluded.fetched_at;
  `);
}

function saveRegimeRows(payload) {
  if (!SQLITE_ENABLED) return;
  const generatedAt = payload.metadata.generatedAt;
  const statements = [
    "BEGIN;",
    `INSERT INTO regime_runs (generated_at, requested_start, requested_end, data_through, payload_json)
      VALUES (
        ${sqlString(generatedAt)},
        ${sqlString(payload.metadata.requestedStart)},
        ${sqlString(payload.metadata.requestedEnd)},
        ${sqlString(payload.metadata.dataThrough || "")},
        ${sqlString(JSON.stringify(payload))}
      );`
  ];

  for (const row of payload.regimes) {
    statements.push(`
      INSERT INTO weekly_regimes (week_end, week_start, code, label, label_zh, confidence, row_json, generated_at)
      VALUES (
        ${sqlString(row.weekEnd)},
        ${sqlString(row.weekStart)},
        ${sqlString(row.code)},
        ${sqlString(row.label)},
        ${sqlString(row.labelZh)},
        ${row.confidence},
        ${sqlString(JSON.stringify(row))},
        ${sqlString(generatedAt)}
      )
      ON CONFLICT(week_end) DO UPDATE SET
        week_start = excluded.week_start,
        code = excluded.code,
        label = excluded.label,
        label_zh = excluded.label_zh,
        confidence = excluded.confidence,
        row_json = excluded.row_json,
        generated_at = excluded.generated_at;
    `);
  }

  for (const asset of payload.assetRegimes || []) {
    for (const row of asset.regimes || []) {
      statements.push(`
        INSERT INTO asset_weekly_regimes (symbol, display_symbol, name, group_name, week_end, week_start, code, label, label_zh, confidence, row_json, generated_at)
        VALUES (
          ${sqlString(asset.symbol)},
          ${sqlString(asset.displaySymbol)},
          ${sqlString(asset.name)},
          ${sqlString(asset.group)},
          ${sqlString(row.weekEnd)},
          ${sqlString(row.weekStart)},
          ${sqlString(row.code)},
          ${sqlString(row.label)},
          ${sqlString(row.labelZh)},
          ${row.confidence},
          ${sqlString(JSON.stringify(row))},
          ${sqlString(generatedAt)}
        )
        ON CONFLICT(symbol, week_end) DO UPDATE SET
          display_symbol = excluded.display_symbol,
          name = excluded.name,
          group_name = excluded.group_name,
          week_start = excluded.week_start,
          code = excluded.code,
          label = excluded.label,
          label_zh = excluded.label_zh,
          confidence = excluded.confidence,
          row_json = excluded.row_json,
          generated_at = excluded.generated_at;
      `);
    }
  }

  statements.push("COMMIT;");
  sqliteExec(statements.join("\n"));
}

function sqliteExec(sql) {
  const result = spawnSync(SQLITE_BIN, [SQLITE_PATH], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`sqlite failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function sqliteJson(sql) {
  const result = spawnSync(SQLITE_BIN, ["-json", SQLITE_PATH], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`sqlite failed: ${result.stderr || result.stdout}`);
  }
  const text = result.stdout.trim();
  return text ? JSON.parse(text) : [];
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)} >/dev/null 2>&1`]);
  return result.status === 0;
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function pct(value) {
  return `${round((value || 0) * 100, 1)}%`;
}
