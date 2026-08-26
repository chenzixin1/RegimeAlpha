const DATA_PATH = "/data/regimes.json";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const data = await loadRegimeData(request);
  const symbol = url.searchParams.get("symbol");
  const weekEnd = url.searchParams.get("weekEnd");
  const limit = clampInt(url.searchParams.get("limit"), 1, 104, 12);

  if (symbol) {
    const asset = findAssetSeries(data, symbol);
    if (!asset) {
      return json({ error: `Asset ${symbol} was not found.` }, 404);
    }
    const row = findWeek(asset.regimes, weekEnd) || asset.regimes.at(-1);
    return json({
      metadata: publicMetadata(data),
      asset: {
        symbol: asset.symbol,
        displaySymbol: asset.displaySymbol,
        name: asset.name,
        group: asset.group
      },
      selected: compactAssetRow(row),
      history: asset.regimes.slice(-limit).map(compactAssetRow),
      links: publicLinks(url.origin)
    });
  }

  return json({
    metadata: publicMetadata(data),
    latest: compactMarketRow(data.summary.latest),
    assets: (data.summary?.assets?.latest || []).map(compactAsset),
    recentWeeks: data.regimes.slice(-limit).map(compactMarketRow),
    links: publicLinks(url.origin)
  });
}

async function loadRegimeData(request) {
  const response = await fetch(new URL(DATA_PATH, request.url), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 120, cacheEverything: true }
  });
  if (!response.ok) {
    throw new Error(`RegimeAlpha data fetch failed: ${response.status}`);
  }
  return response.json();
}

function findAssetSeries(data, symbol) {
  const normalized = normalizeSymbol(symbol);
  return (data.assetRegimes || []).find(
    (asset) => normalizeSymbol(asset.symbol) === normalized || normalizeSymbol(asset.displaySymbol) === normalized
  );
}

function normalizeSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (value === "SOX") return "SOXX";
  if (value === "BTC") return "BTCUSD";
  if (value === "NDX") return "^NDX";
  return value;
}

function findWeek(rows, weekEnd) {
  if (!weekEnd) return null;
  return rows.find((row) => row.weekEnd === weekEnd) || null;
}

function publicMetadata(data) {
  return {
    dataThrough: data.metadata?.dataThrough,
    generatedAt: data.metadata?.generatedAt,
    requestedEnd: data.metadata?.requestedEnd,
    model: data.metadata?.model,
    symbols: data.metadata?.symbols
  };
}

function publicLinks(origin) {
  return {
    app: origin,
    fullJson: `${origin}/data/regimes.json`,
    mcp: `${origin}/mcp`,
    exportApi: `${origin}/api/export`
  };
}

function compactMarketRow(row) {
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

function compactAsset(asset) {
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

function compactAssetRow(row) {
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
      "correlationToSpy63",
      "sectorCorrelation20",
      "trendEfficiency20",
      "weekRange",
      "maxAbsDailyReturn",
      "maxDownDailyReturn",
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

function pickMetrics(metrics = {}, keys) {
  return Object.fromEntries(keys.map((key) => [key, metrics[key]]).filter(([, value]) => value !== undefined));
}

function compactTransition(transition) {
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

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "public, max-age=120, stale-while-revalidate=3600"
    }
  });
}
