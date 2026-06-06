export const DEFAULT_DATA_URL = "https://regimealpha.chenzixin.uk/data/regimes.json";
export const DEFAULT_APP_URL = "https://regimealpha.chenzixin.uk";

export async function loadRegimeData(env) {
  const response = await fetch(env.REGIME_DATA_URL || DEFAULT_DATA_URL, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 120, cacheEverything: true }
  });
  if (!response.ok) {
    throw new Error(`RegimeAlpha data fetch failed: ${response.status}`);
  }
  return response.json();
}

export function latestAssets(data) {
  return data.summary?.assets?.latest || [];
}

export function findAssetSeries(data, symbol) {
  const normalized = normalizeSymbol(symbol);
  return (data.assetRegimes || []).find(
    (asset) => normalizeSymbol(asset.symbol) === normalized || normalizeSymbol(asset.displaySymbol) === normalized
  );
}

export function normalizeSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (value === "SOX") return "SOXX";
  if (value === "BTC") return "BTCUSD";
  return value;
}

export function findWeek(rows, weekEnd) {
  if (!weekEnd) return null;
  return rows.find((row) => row.weekEnd === weekEnd) || null;
}

export function publicMetadata(data) {
  return {
    dataThrough: data.metadata?.dataThrough,
    generatedAt: data.metadata?.generatedAt,
    requestedEnd: data.metadata?.requestedEnd,
    model: data.metadata?.model,
    symbols: data.metadata?.symbols
  };
}

export function publicLinks(env) {
  const appUrl = env.REGIME_APP_URL || DEFAULT_APP_URL;
  return {
    app: appUrl,
    fullJson: `${appUrl}/data/regimes.json`,
    mcp: `${appUrl}/mcp`,
    apiExport: `${appUrl}/api/export`
  };
}

export function marketContextForWeek(data, weekEnd) {
  const row = (data.regimes || []).find((item) => item.weekEnd === weekEnd) || data.summary.latest;
  return compactMarketRow(row);
}

export function compactMarketRow(row) {
  if (!row) return null;
  return {
    weekEnd: row.weekEnd,
    code: row.code,
    baselineCode: row.baselineCode,
    baselineLabelZh: row.baselineLabelZh,
    labelZh: row.labelZh,
    label: row.label,
    confidence: row.confidence,
    transition: compactTransition(row.transition),
    thesis: row.thesis,
    drivers: row.drivers || [],
    metrics: pickMetrics(row.metrics, [
      "weeklyReturn",
      "spyOpen",
      "spyHigh",
      "spyLow",
      "spyClose",
      "ret4w",
      "ret13w",
      "realizedVol20",
      "vixClose",
      "sectorCorrelation20",
      "equityBondCorrelation63",
      "drawdown52w",
      "trendEfficiency20",
      "maxDownDailyReturn",
      "downVolumeZ20",
      "downVolumeZ63",
      "distributionDay",
      "distributionDate",
      "shockDownDay"
    ])
  };
}

export function compactAsset(asset) {
  return {
    symbol: asset.symbol,
    displaySymbol: asset.displaySymbol,
    name: asset.name,
    group: asset.group,
    code: asset.code,
    baselineCode: asset.baselineCode,
    labelZh: asset.labelZh,
    label: asset.label,
    confidence: asset.confidence,
    transition: compactTransition(asset.transition),
    weeklyReturn: asset.weeklyReturn,
    ret13w: asset.ret13w,
    relativeToSpy13w: asset.relativeToSpy13w,
    realizedVol20: asset.realizedVol20,
    divergentFromMarket: asset.divergentFromMarket
  };
}

export function compactAssetRow(row) {
  if (!row) return null;
  return {
    weekEnd: row.weekEnd,
    symbol: row.symbol,
    displaySymbol: row.displaySymbol,
    name: row.name,
    group: row.group,
    code: row.code,
    baselineCode: row.baselineCode,
    baselineLabelZh: row.baselineLabelZh,
    labelZh: row.labelZh,
    label: row.label,
    confidence: row.confidence,
    transition: compactTransition(row.transition),
    thesis: row.thesis,
    drivers: row.drivers || [],
    metrics: pickMetrics(row.metrics, [
      "weeklyReturn",
      "ret4w",
      "ret13w",
      "relativeToSpy13w",
      "realizedVol20",
      "realizedVol63",
      "correlationToSpy63",
      "sectorCorrelation20",
      "trendEfficiency20",
      "serialAutocorr20",
      "weekRange",
      "maxAbsDailyReturn",
      "maxDownDailyReturn",
      "maxOpenGap",
      "downVolumeZ20",
      "downVolumeZ63",
      "distributionDay",
      "distributionDate",
      "shockDownDay",
      "drawdown52w",
      "marketCode",
      "marketLabelZh"
    ])
  };
}

export function pickMetrics(metrics = {}, keys) {
  return Object.fromEntries(keys.map((key) => [key, metrics[key]]).filter(([, value]) => value !== undefined));
}

export function compactTransition(transition) {
  if (!transition) return undefined;
  return {
    pressure: transition.pressure,
    status: transition.status,
    switched: transition.switched,
    likelyNext: transition.likelyNext,
    likelyNextLabelZh: transition.likelyNextLabelZh,
    probabilities: transition.probabilities,
    triggers: transition.triggers || []
  };
}

export function textResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

export function errorResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}
