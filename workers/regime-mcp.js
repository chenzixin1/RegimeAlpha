import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

const DEFAULT_DATA_URL = "https://regimealpha.chenzixin.uk/data/regimes.json";
const DEFAULT_APP_URL = "https://regimealpha.chenzixin.uk";

function createServer(env) {
  const server = new McpServer({
    name: "RegimeAlpha",
    version: "1.0.0"
  });

  server.tool(
    "get_latest_regime",
    "Get the latest RegimeAlpha market regime and latest sector/industry/custom asset snapshots.",
    {
      includeAssets: z.boolean().default(true).describe("Whether to include latest asset cards."),
      assetLimit: z.number().int().min(1).max(50).default(30).describe("Maximum latest assets to include.")
    },
    async ({ includeAssets, assetLimit }) => {
      const data = await loadRegimeData(env);
      const latest = compactMarketRow(data.summary.latest);
      const assets = includeAssets ? latestAssets(data).slice(0, assetLimit).map(compactAsset) : [];
      return textResult({
        metadata: publicMetadata(data),
        latest,
        assets,
        links: publicLinks(env)
      });
    }
  );

  server.tool(
    "get_asset_regime",
    "Get regime details for one asset/proxy such as SPY, QQQ, SOX, SOXX, DRAM, BTC, SMH, IGV, XLK, XLE, etc.",
    {
      symbol: z.string().describe("Asset symbol or display symbol. Examples: SPY, SOX, SOXX, DRAM, BTC."),
      weekEnd: z.string().optional().describe("Optional week end date in YYYY-MM-DD. Defaults to latest available."),
      historyWeeks: z.number().int().min(1).max(52).default(8).describe("Recent weekly history count to include.")
    },
    async ({ symbol, weekEnd, historyWeeks }) => {
      const data = await loadRegimeData(env);
      const asset = findAssetSeries(data, symbol);
      if (!asset) return errorResult(`Asset ${symbol} was not found.`);
      const row = findWeek(asset.regimes, weekEnd) || asset.regimes.at(-1);
      const history = asset.regimes.slice(-historyWeeks).map(compactAssetRow);
      return textResult({
        metadata: publicMetadata(data),
        asset: {
          symbol: asset.symbol,
          displaySymbol: asset.displaySymbol,
          name: asset.name,
          group: asset.group
        },
        selected: compactAssetRow(row),
        marketContext: marketContextForWeek(data, row?.weekEnd),
        history,
        links: publicLinks(env)
      });
    }
  );

  server.tool(
    "compare_assets",
    "Compare current or historical regime and key metrics across multiple RegimeAlpha assets.",
    {
      symbols: z.array(z.string()).min(1).max(12).describe("Symbols to compare. Examples: ['SOX','DRAM','BTC','QQQ']."),
      weekEnd: z.string().optional().describe("Optional week end date in YYYY-MM-DD. Defaults to latest available.")
    },
    async ({ symbols, weekEnd }) => {
      const data = await loadRegimeData(env);
      const compared = symbols.map((symbol) => {
        const asset = findAssetSeries(data, symbol);
        if (!asset) return { symbol, error: "not found" };
        const row = findWeek(asset.regimes, weekEnd) || asset.regimes.at(-1);
        return compactAssetRow(row);
      });
      return textResult({
        metadata: publicMetadata(data),
        weekEnd: weekEnd || data.metadata.dataThrough,
        assets: compared,
        marketContext: marketContextForWeek(data, weekEnd || data.summary.latest.weekEnd)
      });
    }
  );

  server.tool(
    "list_regime_weeks",
    "List recent weekly market regimes, optionally with one asset's regime alongside the market.",
    {
      limit: z.number().int().min(1).max(104).default(12).describe("Number of recent weeks to return."),
      symbol: z.string().optional().describe("Optional asset symbol to include alongside market rows.")
    },
    async ({ limit, symbol }) => {
      const data = await loadRegimeData(env);
      const asset = symbol ? findAssetSeries(data, symbol) : null;
      const rows = data.regimes.slice(-limit).map((row) => {
        const assetRow = asset?.regimes.find((item) => item.weekEnd === row.weekEnd);
        return {
          market: compactMarketRow(row),
          asset: assetRow ? compactAssetRow(assetRow) : undefined
        };
      });
      return textResult({
        metadata: publicMetadata(data),
        symbol: asset?.displaySymbol || symbol || null,
        rows
      });
    }
  );

  return server;
}

async function loadRegimeData(env) {
  const response = await fetch(env.REGIME_DATA_URL || DEFAULT_DATA_URL, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 120, cacheEverything: true }
  });
  if (!response.ok) {
    throw new Error(`RegimeAlpha data fetch failed: ${response.status}`);
  }
  return response.json();
}

function latestAssets(data) {
  return data.summary?.assets?.latest || [];
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

function publicLinks(env) {
  const appUrl = env.REGIME_APP_URL || DEFAULT_APP_URL;
  return {
    app: appUrl,
    fullJson: `${appUrl}/data/regimes.json`,
    apiExport: `${appUrl}/api/export`
  };
}

function marketContextForWeek(data, weekEnd) {
  const row = (data.regimes || []).find((item) => item.weekEnd === weekEnd) || data.summary.latest;
  return compactMarketRow(row);
}

function compactMarketRow(row) {
  if (!row) return null;
  return {
    weekEnd: row.weekEnd,
    code: row.code,
    labelZh: row.labelZh,
    label: row.label,
    confidence: row.confidence,
    thesis: row.thesis,
    drivers: row.drivers || [],
    metrics: pickMetrics(row.metrics, [
      "weeklyReturn",
      "ret4w",
      "ret13w",
      "realizedVol20",
      "vixClose",
      "sectorCorrelation20",
      "equityBondCorrelation63",
      "drawdown52w",
      "trendEfficiency20"
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
    labelZh: asset.labelZh,
    label: asset.label,
    confidence: asset.confidence,
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
    labelZh: row.labelZh,
    label: row.label,
    confidence: row.confidence,
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
      "maxOpenGap",
      "drawdown52w",
      "marketCode",
      "marketLabelZh"
    ])
  };
}

function pickMetrics(metrics = {}, keys) {
  return Object.fromEntries(keys.map((key) => [key, metrics[key]]).filter(([, value]) => value !== undefined));
}

function textResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

function errorResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "RegimeAlpha MCP",
        status: "ok",
        mcp: "/mcp",
        fullJson: `${env.REGIME_APP_URL || DEFAULT_APP_URL}/data/regimes.json`
      });
    }
    const handler = createMcpHandler(createServer(env));
    return handler(request, env, ctx);
  }
};
