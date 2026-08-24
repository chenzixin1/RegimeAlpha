"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

const COLORS = {
  bull_quiet: "#2e9d68",
  bull_volatile: "#92a933",
  bear_quiet: "#b65f5a",
  bear_volatile: "#d8483e",
  sideways_quiet: "#7f8b92",
  sideways_volatile: "#c78928",
  trend_accelerating: "#2d7fb9",
  mean_reverting: "#8a67bd",
  stagflationary: "#8f7445",
  microstructure_dislocation: "#23272f"
};

const FAMILY_LABELS = {
  all: "全部",
  bull: "牛市",
  bear: "熊市",
  sideways: "震荡",
  special: "特殊"
};

const REGIME_LABELS_ZH = {
  bull_quiet: "牛市低波",
  bull_volatile: "牛市高波",
  bear_quiet: "熊市低波",
  bear_volatile: "熊市高波",
  sideways_quiet: "震荡低波",
  sideways_volatile: "震荡高波",
  trend_accelerating: "趋势加速",
  mean_reverting: "均值回归",
  stagflationary: "滞胀冲击",
  microstructure_dislocation: "微观结构错位"
};

const METRIC_EXPLANATIONS = {
  Week: {
    title: "周结束日",
    body: "这一条 regime 记录对应的交易周结束日期，通常是该周最后一个有行情数据的交易日。"
  },
  "SPY 13W": {
    title: "SPY 近 13 周收益",
    body: "以 SPY 作为美股大盘代理，计算最近约一个季度的累计价格收益，用来判断市场中期方向。"
  },
  VIX: {
    title: "VIX 恐慌指数",
    body: "CBOE VIX 指数，反映标普 500 期权隐含波动率。数值越高，市场定价的波动和风险溢价通常越高。"
  },
  Confidence: {
    title: "模型置信度",
    body: "规则分类器对当前 regime 标签的相对把握程度。越高表示当前指标组合越集中地支持这个标签。"
  },
  "Switch Risk": {
    title: "Regime 切换风险",
    body: "TVTP proxy 对当前周从 baseline regime 转向其他 regime 的压力估计，结合周跌幅、放量下跌、VIX、趋势效率和均线破位。"
  },
  "1W": {
    title: "近 1 周收益",
    body: "从上一周收盘到本周收盘的价格收益率，用来观察最新一周的方向冲击。"
  },
  "4W": {
    title: "近 4 周收益",
    body: "最近约一个月的累计价格收益，辅助判断短期趋势是否延续或反转。"
  },
  "13W": {
    title: "近 13 周收益",
    body: "最近约一个季度的累计价格收益，是判断中期牛熊、趋势和相对强弱的核心输入。"
  },
  "20D Vol": {
    title: "20 日实现波动率",
    body: "用过去 20 个交易日的日收益波动估算并年化，表示近期实际走出来的价格波动强度。"
  },
  Corr: {
    title: "行业相关性",
    body: "市场层面的行业 ETF 相关性指标。数值越高，说明板块更同步，分散化和选股空间通常更弱。"
  },
  "Eq/Bond": {
    title: "股债相关性",
    body: "SPY 与 TLT 的近 63 个交易日滚动相关。转正时，传统股债分散保护可能变弱。"
  },
  "DD 52W": {
    title: "52 周回撤",
    body: "当前价格相对过去 52 周高点的跌幅，用来衡量中期下行压力和修复距离。"
  },
  "Rel SPY": {
    title: "相对 SPY 13 周收益",
    body: "该资产近 13 周收益减去 SPY 近 13 周收益。正值表示跑赢大盘，负值表示跑输。"
  },
  "Corr SPY": {
    title: "与 SPY 相关性",
    body: "该资产与 SPY 的近 63 个交易日滚动相关。接近 1 表示同涨同跌更明显，接近 0 或负值表示独立性更强。"
  },
  "SPY 大盘": {
    title: "SPY 大盘 Regime",
    body: "这是同一周 SPY 代表的大盘 regime，用来和当前资产自己的 regime 对比。它不等于上方资产卡片里的行业/资产 regime。"
  }
};

const SUMMARY_CARD_EXPLANATIONS = {
  "Switch Risk": {
    title: "Switch Risk / TVTP",
    body: "TVTP proxy 是本周 regime 切换压力。这里用近 6 周走势展示风险从稳定到切换的路径，而不再单独重复一张文字卡。"
  },
  "SPY 1W": {
    title: "SPY 周线蜡烛",
    body: "图展示最近 12 周 SPY 周线，卡片数值是最新一周收益，用来说明这次 regime 变化里的短期价格冲击。"
  },
  VIX: METRIC_EXPLANATIONS.VIX,
  "Volume Shock": {
    title: "Distribution day",
    body: "单日放量下跌特征。Down-volume z-score 越高，说明下跌成交冲击越异常，是论文实现里需要参与切换惩罚的输入。"
  }
};

const OBSERVATION_METRIC_GLOSSARY = {
  "13W return": "近 13 周累计收益，用来判断约一个季度维度的趋势方向和强弱。",
  "4W return": "近 4 周累计收益，用来观察短期动量是否正在加速。",
  "4W reversal": "近 4 周方向反转特征，提示前期趋势是否出现衰竭和回拉。",
  "52W drawdown": "相对过去 52 周高点的回撤幅度，用来识别中期下行压力。",
  "abs 13W return": "近 13 周收益的绝对值，用来判断市场是否缺少明确方向。",
  autocorr: "收益序列自相关，正值偏趋势延续，负值偏均值回归。",
  drawdown: "价格从阶段高点回落的幅度，用来衡量趋势破坏程度。",
  "equity-bond corr": "股票与长债的滚动相关性，转正时传统股债分散保护会变弱。",
  gap: "开盘跳空幅度，常用于识别突发冲击或流动性断层。",
  "max daily move": "单日最大绝对波动，衡量本周是否出现异常冲击。",
  "rel SPY": "相对 SPY 的收益差，正值表示跑赢大盘，负值表示跑输。",
  "reversal rate": "短周期反转发生频率，越高越不利于机械趋势跟随。",
  "sector corr": "行业 ETF 之间的相关性，越高表示板块同步性越强、分散化越弱。",
  "sector rotation": "资金在板块之间切换的强度，震荡环境中常比指数方向更重要。",
  "SPY 13W": "SPY 近 13 周收益，作为美股大盘的中期方向代理。",
  "TLT 13W": "TLT 近 13 周收益，作为长债表现和久期压力的代理。",
  "trend efficiency": "趋势效率，衡量价格移动是否沿着单一方向推进，而不是来回震荡。",
  VIX: "VIX 隐含波动率，反映市场对未来波动和风险溢价的定价。",
  "VIX spike": "VIX 快速上冲，常表示避险需求或波动冲击突然放大。",
  "20D vol": "20 日实现波动率，用过去约一个月日收益波动年化估算。",
  "vol compression": "波动压缩，表示近期价格波动收敛，后续可能等待方向选择。",
  "weekly range": "本周最高价到最低价的振幅，衡量周内路径摆动强度。"
};

const REGIME_EXPLAINERS = {
  bull_quiet: {
    signal: "13 周收益为正，VIX 和 20D 实现波动偏低，行业相关性下降。",
    metrics: "13W return / VIX / 20D vol / sector corr",
    posture: "提高横截面 alpha 权重，保留趋势多头，但不为保护付过高时间价值。"
  },
  bull_volatile: {
    signal: "价格继续上行，但 VIX、周内振幅或实现波动同步扩张。",
    metrics: "13W return / VIX / weekly range / drawdown",
    posture: "顺势但降杠杆，用波动过滤和更短持有期控制回撤。"
  },
  bear_quiet: {
    signal: "13 周趋势转弱或回撤扩大，但恐慌指标尚未明显爆发。",
    metrics: "13W return / 52W drawdown / VIX / trend efficiency",
    posture: "偏防御、偏相对价值，避免用高 beta 多头硬扛慢速下修。"
  },
  bear_volatile: {
    signal: "下跌加速，VIX、实现波动、相关性一起抬升，分散化变弱。",
    metrics: "VIX / 20D vol / sector corr / max daily move",
    posture: "优先保护凸性和流动性，降低裸露方向 beta。"
  },
  sideways_quiet: {
    signal: "13 周净方向接近 0，波动和区间宽度都偏窄。",
    metrics: "abs 13W return / VIX / 20D vol / sector rotation",
    posture: "做区间、做相对价值、做时间价值，避免追假突破。"
  },
  sideways_volatile: {
    signal: "指数净方向不强，但周内或日内路径摆动很大。",
    metrics: "trend efficiency / weekly range / 20D vol / reversal rate",
    posture: "把路径依赖当作主要风险源，趋势交易必须加过滤。"
  },
  trend_accelerating: {
    signal: "4 周和 13 周收益同向走强，趋势效率上升，领涨主题持续扩散。",
    metrics: "4W return / 13W return / trend efficiency / rel SPY",
    posture: "让赢家继续跑，适合趋势跟随和强势产业轮动。"
  },
  mean_reverting: {
    signal: "前期方向运动衰竭，短期反转特征增强，拥挤交易开始松动。",
    metrics: "4W reversal / autocorr / vol compression / drawdown",
    posture: "降低追涨杀跌，转向价差收敛和短周期反转。"
  },
  stagflationary: {
    signal: "股票和长债同步承压，股债相关性转正，传统分散保护变弱。",
    metrics: "SPY 13W / TLT 13W / equity-bond corr / VIX",
    posture: "控制久期和 beta 叠加风险，强调现金、低 beta 和择时。"
  },
  microstructure_dislocation: {
    signal: "跳空、异常振幅、成交或价格链条出现短暂断层。",
    metrics: "gap / max daily move / weekly range / VIX spike",
    posture: "先处理执行和流动性，再判断方向；避免在冲击周短 gamma。"
  }
};

const ARTICLE_PDF_PATH = "/articles/market-regime-transition-probability-study.pdf";
const ARTICLE_TRANSLATION_PATH = "/articles/market-regime-transition-probability-study.zh.md";
const CHAT_SUGGESTIONS = [
  "用原文 TVTP 框架解释现在为什么是牛市高波",
  "SOX/DRAM/BTC/EWY 的 regime 和大盘有什么分化？",
  "现在哪些指标最可能提示 regime 切换？"
];

const INDUSTRY_VARIANTS = {
  a: {
    label: "A",
    title: "Regime 排序卡片",
    description: "保留现有周 K 卡片，以模型原始字段重新排序。"
  },
  b: {
    label: "B",
    title: "Regime 研究表格",
    description: "横向审计 Regime、趋势、风险与置信度。"
  },
  c: {
    label: "C",
    title: "Regime 强弱地图",
    description: "用 Rel SPY 与 Switch Risk 定位板块分化。"
  },
  merged: {
    label: "M",
    title: "Regime 研究工作台",
    description: "卡片扫描、可排序表格与强弱地图在同一上下文联动。"
  }
};

const ASSET_SORT_OPTIONS = [
  { key: "symbol", label: "标的代码", defaultDirection: "asc" },
  { key: "regime", label: "Regime", defaultDirection: "asc" },
  { key: "ret13w", label: "13W 收益", defaultDirection: "desc" },
  { key: "relativeToSpy13w", label: "Rel SPY", defaultDirection: "desc" },
  { key: "weeklyReturn", label: "1W 收益", defaultDirection: "desc" },
  { key: "ret4w", label: "4W 收益", defaultDirection: "desc" },
  { key: "switchRisk", label: "Switch Risk", defaultDirection: "desc" },
  { key: "confidence", label: "Confidence", defaultDirection: "desc" },
  { key: "realizedVol20", label: "20D Vol", defaultDirection: "asc" },
  { key: "drawdown52w", label: "52W Drawdown", defaultDirection: "desc" }
];

export default function RegimeDashboard({ initialData, previewConfig = null, initialPreviewCandles = null, industryVariant = null }) {
  const [data, setData] = useState(initialData);
  const [previewCandles, setPreviewCandles] = useState(initialPreviewCandles);
  const [selectedWeek, setSelectedWeek] = useState(initialData.summary.latest.weekEnd);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState("SOXX");
  const [heatmapKey, setHeatmapKey] = useState("MARKET");
  const [referenceCode, setReferenceCode] = useState(initialData.summary.latest.code);
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [assetGroup, setAssetGroup] = useState("all");
  const [assetRegimeCode, setAssetRegimeCode] = useState("all");
  const [assetSortKey, setAssetSortKey] = useState("ret13w");
  const [assetSortDirection, setAssetSortDirection] = useState("desc");
  const [assetHistoryPeriod, setAssetHistoryPeriod] = useState("52W");
  const [heatmapTooltip, setHeatmapTooltip] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "我可以结合原始文章、MCP 策略知识和当前 RegimeAlpha 数据，解释 regime、指标、板块分化和潜在切换信号。"
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  useEffect(() => {
    if (previewConfig?.disableDataRefresh) return undefined;

    async function loadWorkerData() {
      try {
        const dataUrl = previewConfig?.refreshDataUrl || "/data/regimes.json";
        const separator = dataUrl.includes("?") ? "&" : "?";
        const response = await fetch(`${dataUrl}${separator}ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const nextData = await response.json();
        if (nextData?.summary?.latest?.weekEnd) {
          startTransition(() => setData(nextData));
        }
      } catch (error) {
        console.warn("Live regime data refresh failed.", error);
        // Keep static build-time data when the deployed JSON route is unavailable.
      }
    }
    loadWorkerData();
    return undefined;
  }, [previewConfig?.disableDataRefresh, previewConfig?.refreshDataUrl]);

  useEffect(() => {
    if (!previewConfig?.candleDataUrl) return undefined;

    async function loadPreviewCandles() {
      try {
        const separator = previewConfig.candleDataUrl.includes("?") ? "&" : "?";
        const response = await fetch(`${previewConfig.candleDataUrl}${separator}ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const nextData = await response.json();
        if (nextData?.weekEnd && nextData?.candles) {
          startTransition(() => setPreviewCandles(nextData));
        }
      } catch (error) {
        console.warn("Live preview candle refresh failed.", error);
        // Keep preview card layout even if the local candle API is unavailable.
      }
    }

    loadPreviewCandles();
    return undefined;
  }, [previewConfig?.candleDataUrl]);

  const rows = data.regimes;
  const assetRegimes = data.assetRegimes || [];
  const definitions = data.regimeDefinitions;
  const latest = data.summary.latest;
  const previous = rows.at(-2) || null;
  const weeklyChange = useMemo(() => buildWeeklyChangeSummary(latest, previous), [latest, previous]);
  const weeklyCharts = useMemo(() => buildWeeklySummaryCharts(rows), [rows]);
  const selected = rows.find((row) => row.weekEnd === selectedWeek) || latest;
  const selectedAsset = assetRegimes.find((asset) => asset.symbol === selectedAssetSymbol) || assetRegimes[0];
  const selectedAssetRow = selectedAsset?.regimes.find((row) => row.weekEnd === selected.weekEnd) || selectedAsset?.regimes.at(-1);
  const detailIsAsset = Boolean(selectedAssetRow);
  const detailRow = selectedAssetRow || selected;
  const detailStrategies = detailIsAsset ? data.strategyMap?.[detailRow.code] : selected.strategies;
  const assetRowsForWeek = useMemo(
    () =>
      assetRegimes
        .map((asset) => {
          const row = asset.regimes.find((item) => item.weekEnd === selected.weekEnd) || asset.regimes.at(-1);
          return row ? { ...row, proxyNote: asset.proxyNote } : null;
        })
        .filter(Boolean),
    [assetRegimes, selected.weekEnd]
  );
  const assetGroups = useMemo(
    () => [...new Set(assetRowsForWeek.map((row) => row.group))],
    [assetRowsForWeek]
  );
  const assetRegimeCodes = useMemo(
    () => [...new Set(assetRowsForWeek.map((row) => row.code))],
    [assetRowsForWeek]
  );
  const filteredAssetRows = useMemo(
    () => assetRowsForWeek
      .filter((row) => assetGroup === "all" || row.group === assetGroup)
      .filter((row) => assetRegimeCode === "all" || row.code === assetRegimeCode),
    [assetGroup, assetRegimeCode, assetRowsForWeek]
  );
  const rankedAssetRows = useMemo(() => {
    const direction = assetSortDirection === "asc" ? 1 : -1;
    return [...filteredAssetRows].sort((left, right) => compareAssetRows(left, right, assetSortKey) * direction);
  }, [assetSortDirection, assetSortKey, filteredAssetRows]);
  const marketAsset = assetRegimes.find((asset) => asset.symbol === "SPY") || assetRegimes[0];
  const byAssetWeek = useMemo(() => {
    const map = new Map();
    for (const asset of assetRegimes) {
      map.set(asset.symbol, new Map(asset.regimes.map((row) => [row.weekEnd, row])));
    }
    return map;
  }, [assetRegimes]);
  const soxSelected = assetRowsForWeek.find((row) => row.displaySymbol === "SOX");
  const igvSelected = assetRowsForWeek.find((row) => row.displaySymbol === "IGV");
  const heatmapTabs = useMemo(
    () => [
      {
        key: "MARKET",
        displaySymbol: "Market",
        name: "SPY market regime",
        group: "Market",
        regimes: rows
      },
      ...assetRegimes
        .filter((asset) => asset.symbol !== "SPY")
        .map((asset) => ({
          key: asset.symbol,
          displaySymbol: asset.displaySymbol,
          name: asset.name,
          group: asset.group,
          regimes: asset.regimes
        }))
    ],
    [assetRegimes, rows]
  );
  const heatmapTab = heatmapTabs.find((tab) => tab.key === heatmapKey) || heatmapTabs[0];
  const heatmapRows = heatmapTab?.regimes || rows;
  const heatmapSelectedRow = heatmapRows.find((row) => row.weekEnd === selected.weekEnd) || heatmapRows.at(-1);

  useEffect(() => {
    if (!rows.some((row) => row.weekEnd === selectedWeek)) {
      setSelectedWeek(latest.weekEnd);
    }
  }, [latest.weekEnd, rows, selectedWeek]);

  useEffect(() => {
    if (previewConfig?.syncSelectedWeekToLatest && selectedWeek !== latest.weekEnd) {
      setSelectedWeek(latest.weekEnd);
    }
  }, [latest.weekEnd, previewConfig?.syncSelectedWeekToLatest, selectedWeek]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const familyMatch = family === "all" || row.family === family;
      const queryMatch =
        !needle ||
        row.weekEnd.includes(needle) ||
        row.weekStart.includes(needle) ||
        row.label.toLowerCase().includes(needle) ||
        row.labelZh.toLowerCase().includes(needle);
      return familyMatch && queryMatch;
    });
  }, [family, query, rows]);

  const years = useMemo(() => groupByYear(heatmapRows), [heatmapRows]);
  const cumulative = useMemo(() => buildCumulative(rows), [rows]);
  const heatmapTooltipPosition = (clientX, clientY) => ({
    x: Math.max(12, Math.min(clientX + 12, window.innerWidth - 292)),
    y: Math.max(12, Math.min(clientY + 12, window.innerHeight - 132))
  });
  const showHeatmapTooltip = (row, event, fromFocus = false) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = fromFocus ? heatmapTooltipPosition(rect.right, rect.top) : heatmapTooltipPosition(event.clientX, event.clientY);
    setHeatmapTooltip({
      ...position,
      symbol: heatmapTab.displaySymbol,
      weekEnd: row.weekEnd,
      label: row.label,
      labelZh: row.labelZh,
      ret13w: row.metrics?.ret13w,
      confidence: row.confidence,
      drivers: row.drivers?.slice(0, 2) || []
    });
  };
  const moveHeatmapTooltip = (row, event) => showHeatmapTooltip(row, event);
  const hideHeatmapTooltip = () => setHeatmapTooltip(null);
  const selectAssetSort = (key) => {
    const option = ASSET_SORT_OPTIONS.find((item) => item.key === key);
    setAssetSortKey(key);
    setAssetSortDirection(option?.defaultDirection || "desc");
  };
  const toggleAssetSort = (key) => {
    if (key === assetSortKey) {
      setAssetSortDirection((value) => (value === "desc" ? "asc" : "desc"));
      return;
    }
    selectAssetSort(key);
  };
  const askChat = async (preset) => {
    const content = (preset || chatInput).trim();
    if (!content || chatLoading) return;

    const nextMessages = [...chatMessages, { role: "user", content }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatError(null);
    setChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context: {
            selectedWeek: selected.weekEnd,
            selectedAssetSymbol,
            heatmapKey
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Chat API ${response.status}`);
      }
      setChatMessages((messages) => [...messages, { role: "assistant", content: payload.answer }]);
    } catch (error) {
      setChatError(error.message || "研究助手暂时不可用。");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="app-shell" data-testid={industryVariant ? `full-demo-${industryVariant}` : undefined}>
      <header className="topbar">
        <div>
          <p className="kicker">RegimeAlpha / US Equities</p>
          <h1>美股周度 Regime 地图</h1>
          {previewConfig?.label ? <span className="preview-badge">{previewConfig.label}</span> : null}
          {industryVariant ? <IndustryVariantNav activeVariant={industryVariant} /> : null}
        </div>
        <div className="freshness">
          <span>数据截至</span>
          <strong>{data.metadata.dataThrough}</strong>
          <span>生成于 {formatDateTime(data.metadata.generatedAt)}</span>
        </div>
      </header>

      <main className="dashboard">
        <WeeklySummary summary={weeklyChange} charts={weeklyCharts} latest={latest} previous={previous} />

        <section className="source-panel">
          <div>
            <p className="eyebrow">Source Article</p>
            <h3>Empirical Dynamics of Market Regime Transitions</h3>
            <p>原始 PDF 已作为研究资料挂载；右下角研究助手会同时读取文章摘录和当前最新数据。</p>
          </div>
          <div className="source-actions">
            <a href={ARTICLE_PDF_PATH} download>
              下载原始 PDF
            </a>
            <a href={ARTICLE_TRANSLATION_PATH} download>
              下载中文摘译
            </a>
            <a href="/api/export" target="_blank" rel="noreferrer">
              下载数据接口
            </a>
            <button type="button" onClick={() => setChatOpen(true)}>
              询问研究助手
            </button>
          </div>
        </section>

        <section className="mcp-panel">
          <div>
            <p className="eyebrow">Agent Access</p>
            <h3>数据接口 / MCP</h3>
            <p>其他 agent 可以直接读取 RegimeAlpha 的市场数据、文章策略知识和持仓风险映射。</p>
          </div>
          <div className="endpoint-list">
            <div>
              <span>JSON API</span>
              <code>https://regimealpha.chenzixin.uk/api/export</code>
            </div>
            <div>
              <span>MCP endpoint</span>
              <code>https://regimealpha.chenzixin.uk/mcp</code>
            </div>
            <div>
              <span>Local proxy</span>
              <code>npx mcp-remote https://regimealpha.chenzixin.uk/mcp</code>
            </div>
          </div>
          <p className="mcp-note">
            MCP tools include live regime data, strategy playbooks, instrument guidance, position risk mapping, and optional article chunks.
          </p>
        </section>

        <section className="controls-panel">
          <div className="segmented" aria-label="Regime family filter">
            {Object.entries(FAMILY_LABELS).map(([key, label]) => (
              <button key={key} className={family === key ? "active" : ""} onClick={() => setFamily(key)}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="日期 / regime"
            aria-label="Search weeks"
          />
          <button className="ghost-button" onClick={() => downloadCsv(rows, assetRegimes)}>
            CSV
          </button>
        </section>

        <section className="heatmap-panel">
          <PanelTitle title="五年周度热力图" meta={`${heatmapTab.displaySymbol} · ${heatmapRows.length} weeks`} />
          <RegimeLegend
            definitions={definitions}
            strategyMap={data.strategyMap}
            activeCode={referenceCode}
            onSelect={setReferenceCode}
          />
          <RegimeReference definitions={definitions} strategyMap={data.strategyMap} activeCode={referenceCode} />
          <div className="heatmap-tabs" aria-label="Heatmap data source">
            {heatmapTabs.map((tab) => {
              const rowForTab = tab.regimes.find((row) => row.weekEnd === selected.weekEnd) || tab.regimes.at(-1);
              return (
                <button
                  key={tab.key}
                  className={tab.key === heatmapTab.key ? "active" : ""}
                  onClick={() => {
                    setHeatmapKey(tab.key);
                    if (tab.key !== "MARKET") setSelectedAssetSymbol(tab.key);
                  }}
                  title={`${tab.displaySymbol} · ${tab.name}`}
                >
                  {rowForTab ? <RegimeLogo code={rowForTab.code} size={18} /> : null}
                  <strong>{tab.displaySymbol}</strong>
                  <span>{tab.group}</span>
                </button>
              );
            })}
          </div>
          <div className="heatmap">
            {years.map(([year, yearRows]) => (
              <div className="heatmap-row" key={year}>
                <div className="year-label">{year}</div>
                <div className="week-grid">
                  {yearRows.map((row) => {
                    const muted = family !== "all" && row.family !== family;
                    return (
                      <button
                        key={row.weekEnd}
                        className={`heat-cell logo-cell ${selected.weekEnd === row.weekEnd ? "selected" : ""} ${muted ? "muted" : ""}`}
                        style={{ "--cell": COLORS[row.code] }}
                        aria-label={`${heatmapTab.displaySymbol} ${row.weekEnd} ${row.labelZh}`}
                        onBlur={hideHeatmapTooltip}
                        onFocus={(event) => showHeatmapTooltip(row, event, true)}
                        onClick={() => {
                          setSelectedWeek(row.weekEnd);
                          if (heatmapTab.key !== "MARKET") setSelectedAssetSymbol(heatmapTab.key);
                        }}
                        onMouseEnter={(event) => showHeatmapTooltip(row, event)}
                        onMouseLeave={hideHeatmapTooltip}
                        onMouseMove={(event) => moveHeatmapTooltip(row, event)}
                      >
                        <RegimeLogo code={row.code} size={26} compact />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {heatmapTooltip ? (
            <div className="heatmap-tooltip" role="tooltip" style={{ left: heatmapTooltip.x, top: heatmapTooltip.y }}>
              <div className="tooltip-kicker">
                <strong>{heatmapTooltip.symbol}</strong>
                <span>{heatmapTooltip.weekEnd}</span>
              </div>
              <div className="tooltip-title">
                {heatmapTooltip.labelZh}
                <span>{heatmapTooltip.label}</span>
              </div>
              <div className="tooltip-metrics">
                <span>13W {formatPercent(heatmapTooltip.ret13w)}</span>
                <span>Conf {formatPercent(heatmapTooltip.confidence)}</span>
              </div>
              {heatmapTooltip.drivers.length ? <p>{heatmapTooltip.drivers.join(" / ")}</p> : null}
            </div>
          ) : null}
          {heatmapSelectedRow ? (
            <div className="heatmap-status" style={{ "--accent": COLORS[heatmapSelectedRow.code] }}>
              <RegimeLogo code={heatmapSelectedRow.code} size={20} />
              <strong>{heatmapTab.displaySymbol}</strong>
              <span>{heatmapSelectedRow.weekEnd}</span>
              <b>{heatmapSelectedRow.labelZh}</b>
              <em>{formatPercent(heatmapSelectedRow.metrics.ret13w)}</em>
            </div>
          ) : null}
        </section>

        <section className={`asset-panel ${industryVariant ? "industry-workspace" : ""}`} id="asset-regime-panel">
          <PanelTitle title="行业 / 产业 Regime" meta={`${selected.weekEnd} · ${assetRowsForWeek.length} proxies`} />
          {industryVariant ? (
            <>
              <IndustryVariantLead variant={industryVariant} />
              <AssetUniverseControls
                assetGroup={assetGroup}
                assetGroups={assetGroups}
                assetRegimeCode={assetRegimeCode}
                assetRegimeCodes={assetRegimeCodes}
                assetSortDirection={assetSortDirection}
                assetSortKey={assetSortKey}
                definitions={definitions}
                onDirectionChange={() => setAssetSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
                onGroupChange={setAssetGroup}
                onRegimeChange={setAssetRegimeCode}
                onSortChange={selectAssetSort}
                resultCount={rankedAssetRows.length}
                variant={industryVariant}
              />
              {industryVariant === "a" ? (
                <AssetRankCardView
                  definitions={definitions}
                  onSelect={setSelectedAssetSymbol}
                  previewCandles={previewCandles}
                  rows={rankedAssetRows}
                  selectedSymbol={selectedAssetRow?.symbol}
                  sortKey={assetSortKey}
                  strategyMap={data.strategyMap}
                />
              ) : null}
              {industryVariant === "b" ? (
                <AssetResearchTable
                  onSort={toggleAssetSort}
                  onSelect={setSelectedAssetSymbol}
                  rows={rankedAssetRows}
                  selectedSymbol={selectedAssetRow?.symbol}
                  sortDirection={assetSortDirection}
                  sortKey={assetSortKey}
                />
              ) : null}
              {industryVariant === "c" ? (
                <AssetRegimeMap
                  onSelect={setSelectedAssetSymbol}
                  rows={rankedAssetRows}
                  selectedSymbol={selectedAssetRow?.symbol}
                />
              ) : null}
              {industryVariant === "merged" ? (
                <UnifiedIndustryWorkspace
                  filteredRows={filteredAssetRows}
                  onSelect={setSelectedAssetSymbol}
                  onSort={toggleAssetSort}
                  rows={rankedAssetRows}
                  selectedSymbol={selectedAssetRow?.symbol}
                  sortDirection={assetSortDirection}
                  sortKey={assetSortKey}
                />
              ) : null}
              <AssetHistoryDrilldown
                asset={selectedAsset}
                endWeek={selected.weekEnd}
                market={marketAsset}
                period={assetHistoryPeriod}
                selectedRow={selectedAssetRow}
                setPeriod={setAssetHistoryPeriod}
              />
            </>
          ) : (
            <div className={`asset-grid ${previewConfig?.showAssetWeekCandle ? "asset-grid-preview" : ""}`}>
              {assetRowsForWeek.map((row) => (
                <button
                  key={row.symbol}
                  className={`asset-tile ${previewConfig?.showAssetWeekCandle ? "asset-tile-preview" : ""} ${selectedAssetRow?.symbol === row.symbol ? "selected" : ""}`}
                  style={{ "--accent": COLORS[row.code] }}
                  onClick={() => setSelectedAssetSymbol(row.symbol)}
                  title={previewConfig?.showAssetWeekCandle ? undefined : `${row.displaySymbol} ${row.name} · ${row.labelZh}`}
                >
                  {previewConfig?.showAssetWeekCandle ? (
                    <AssetPreviewTileContent
                      row={row}
                      candle={previewCandles?.weekEnd === row.weekEnd ? previewCandles.candles?.[row.symbol] : null}
                      definition={definitions[row.code]}
                      strategies={data.strategyMap?.[row.code]}
                    />
                  ) : (
                    <>
                      <span className="asset-topline">
                        <strong>{row.displaySymbol}</strong>
                        <em>{row.group}</em>
                      </span>
                      <span className="asset-name">{row.name}</span>
                      <span className="asset-bottomline">
                        <span className="asset-regime">
                          <RegimeLogo code={row.code} size={18} />
                          {row.labelZh}
                        </span>
                        <b className={tone(row.metrics.ret13w)}>{formatPercent(row.metrics.ret13w)}</b>
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          {soxSelected && igvSelected ? (
            <div className="split-callout">
              <span>SOX: {soxSelected.labelZh} / 13W {formatPercent(soxSelected.metrics.ret13w)}</span>
              <span>IGV: {igvSelected.labelZh} / 13W {formatPercent(igvSelected.metrics.ret13w)}</span>
              <strong>{soxSelected.code === igvSelected.code ? "同 regime" : "分化 regime"}</strong>
            </div>
          ) : null}
        </section>

        <aside className="detail-panel" style={{ "--accent": COLORS[detailRow.code] }}>
          <PanelTitle
            title={
              <>
                <RegimeLogo code={detailRow.code} size={24} />
                {detailRow.labelZh}
              </>
            }
            meta={detailIsAsset ? `${detailRow.displaySymbol} · ${detailRow.name} · ${detailRow.weekEnd}` : selected.weekEnd}
          />
          {detailIsAsset && selectedAsset?.proxyNote ? <p className="proxy-note">{selectedAsset.proxyNote}</p> : null}
          <p className="detail-thesis">{detailRow.thesis}</p>
          <div className="driver-list">
            {detailRow.drivers.map((driver) => (
              <span key={driver}>{driver}</span>
            ))}
          </div>
          <TransitionBlock row={detailRow} />
          <div className="metric-grid compact">
            {detailIsAsset ? (
              <>
                <Metric label="13W" value={formatPercent(detailRow.metrics.ret13w)} tone={tone(detailRow.metrics.ret13w)} />
                <Metric label="Rel SPY" value={formatPercent(detailRow.metrics.relativeToSpy13w)} tone={tone(detailRow.metrics.relativeToSpy13w)} />
                <Metric label="20D Vol" value={formatPercent(detailRow.metrics.realizedVol20)} />
                <Metric label="Corr SPY" value={number(detailRow.metrics.correlationToSpy63, 2)} />
                <Metric label="SPY 大盘" value={selected.labelZh} />
                <Metric label="Confidence" value={formatPercent(detailRow.confidence)} />
              </>
            ) : (
              <>
                <Metric label="1W" value={formatPercent(selected.metrics.weeklyReturn)} tone={tone(selected.metrics.weeklyReturn)} />
                <Metric label="4W" value={formatPercent(selected.metrics.ret4w)} tone={tone(selected.metrics.ret4w)} />
                <Metric label="20D Vol" value={formatPercent(selected.metrics.realizedVol20)} />
                <Metric label="Corr" value={number(selected.metrics.sectorCorrelation20, 2)} />
                <Metric label="Eq/Bond" value={number(selected.metrics.equityBondCorrelation63, 2)} />
                <Metric label="DD 52W" value={formatPercent(selected.metrics.drawdown52w)} tone="bad" />
              </>
            )}
          </div>
          <StrategyBlock strategies={detailStrategies} />
          {detailIsAsset ? (
            <div className="market-context" style={{ "--accent": COLORS[selected.code] }}>
              <span>SPY 大盘对照</span>
              <strong>
                <RegimeLogo code={selected.code} size={18} />
                {selected.labelZh}
              </strong>
              <p>{selected.thesis}</p>
            </div>
          ) : null}
        </aside>

        <section className="timeline-panel">
          <PanelTitle title="SPY 累计表现与 Regime 序列" meta={`${initialData.metadata.requestedStart} - ${initialData.metadata.dataThrough}`} />
          <Timeline rows={rows} cumulative={cumulative} selected={selected} onSelect={setSelectedWeek} />
        </section>

        <section className="summary-panel">
          <PanelTitle title="Regime 分布" meta="count / avg return" />
          <div className="regime-list">
            {initialData.summary.byRegime.map((item) => (
              <button
                key={item.code}
                className="regime-row"
                style={{ "--accent": COLORS[item.code] }}
                onClick={() => {
                  setFamily(definitions[item.code].family);
                  setQuery(item.labelZh);
                }}
              >
                <RegimeLogo code={item.code} size={18} />
                <span>{item.labelZh}</span>
                <strong>{item.count}</strong>
                <em className={item.avgWeeklyReturn >= 0 ? "good" : "bad"}>{formatPercent(item.avgWeeklyReturn)}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="table-panel">
          <PanelTitle title="周度明细" meta={`${filteredRows.length} rows`} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week End</th>
                  <th>Regime</th>
                  <th>SOX</th>
                  <th>IGV</th>
                  <th>1W</th>
                  <th>13W</th>
                  <th>VIX</th>
                  <th>Switch</th>
                  <th>20D Vol</th>
                  <th>Sector Corr</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredRows].reverse().map((row) => (
                  <tr key={row.weekEnd} className={selected.weekEnd === row.weekEnd ? "active-row" : ""} onClick={() => setSelectedWeek(row.weekEnd)}>
                    {(() => {
                      const sox = byAssetWeek.get("SOXX")?.get(row.weekEnd);
                      const igv = byAssetWeek.get("IGV")?.get(row.weekEnd);
                      return (
                        <>
                          <td>{row.weekEnd}</td>
                          <td>
                            <RegimeChip code={row.code} label={row.labelZh} />
                          </td>
                          <td>{sox ? <RegimeChip code={sox.code} label={sox.labelZh} mini /> : "-"}</td>
                          <td>{igv ? <RegimeChip code={igv.code} label={igv.labelZh} mini /> : "-"}</td>
                          <td className={row.metrics.weeklyReturn >= 0 ? "good" : "bad"}>{formatPercent(row.metrics.weeklyReturn)}</td>
                          <td className={row.metrics.ret13w >= 0 ? "good" : "bad"}>{formatPercent(row.metrics.ret13w)}</td>
                          <td>{number(row.metrics.vixClose, 1)}</td>
                          <td className={transitionTone(row.transition)}>{formatPressure(row.transition?.pressure)}</td>
                          <td>{formatPercent(row.metrics.realizedVol20)}</td>
                          <td>{number(row.metrics.sectorCorrelation20, 2)}</td>
                          <td>{formatPercent(row.confidence)}</td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="method-panel">
          <PanelTitle title="模型口径" meta={data.metadata.model} />
          <div className="method-grid">
            {data.metadata.methodology.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </section>
      </main>
      <button type="button" className="chat-launcher" onClick={() => setChatOpen((value) => !value)}>
        研究助手
      </button>
      {chatOpen ? (
        <section className="chat-panel" aria-label="RegimeAlpha research assistant">
          <div className="chat-head">
            <div>
              <span>OpenRouter Research</span>
              <strong>文章 + 当前数据</strong>
            </div>
            <div className="chat-head-actions">
              <button type="button" onClick={() => downloadChatTranscript(chatMessages)}>
                下载聊天记录
              </button>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close assistant">
                ×
              </button>
            </div>
          </div>
          <div className="chat-suggestions">
            {CHAT_SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => askChat(suggestion)} disabled={chatLoading}>
                {suggestion}
              </button>
            ))}
          </div>
          <div className="chat-messages">
            {chatMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                <ChatContent content={message.content} />
              </div>
            ))}
            {chatLoading ? (
              <div className="chat-message assistant">
                <ChatContent content="正在结合文章和数据分析..." />
              </div>
            ) : null}
            {chatError ? <div className="chat-error">{chatError}</div> : null}
          </div>
          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              askChat();
            }}
          >
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="问一个关于 regime、原文框架或板块分化的问题"
              rows={3}
            />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}>
              发送
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function IndustryVariantNav({ activeVariant }) {
  return (
    <nav className="industry-variant-nav" aria-label="完整方案切换">
      {Object.entries(INDUSTRY_VARIANTS).map(([key, item]) => (
        <a key={key} href={`/demos/${key}/`} aria-current={activeVariant === key ? "page" : undefined}>
          <b>{item.label}</b>
          <span>{item.title}</span>
        </a>
      ))}
    </nav>
  );
}

function IndustryVariantLead({ variant }) {
  const meta = INDUSTRY_VARIANTS[variant];
  return (
    <div className="industry-variant-lead">
      <span>Full Dashboard / Version {meta.label}</span>
      <div>
        <h4>{meta.title}</h4>
        <p>{meta.description} Regime 标签、切换压力、置信度和历史序列仍由现有模型直接提供。</p>
      </div>
      <strong>无自定义综合分</strong>
    </div>
  );
}

function AssetUniverseControls({
  assetGroup,
  assetGroups,
  assetRegimeCode,
  assetRegimeCodes,
  assetSortDirection,
  assetSortKey,
  definitions,
  onDirectionChange,
  onGroupChange,
  onRegimeChange,
  onSortChange,
  resultCount,
  variant
}) {
  return (
    <div className="asset-universe-controls">
      <div className="asset-control-group">
        <span>资产范围</span>
        <div className="asset-control-chips">
          <button className={assetGroup === "all" ? "active" : ""} onClick={() => onGroupChange("all")}>全部</button>
          {assetGroups.map((group) => (
            <button key={group} className={assetGroup === group ? "active" : ""} onClick={() => onGroupChange(group)}>{group}</button>
          ))}
        </div>
      </div>
      <label className="asset-control-select">
        <span>Regime</span>
        <select value={assetRegimeCode} onChange={(event) => onRegimeChange(event.target.value)}>
          <option value="all">全部 Regime</option>
          {assetRegimeCodes.map((code) => <option key={code} value={code}>{definitions[code]?.labelZh || REGIME_LABELS_ZH[code] || code}</option>)}
        </select>
      </label>
      {variant !== "c" ? (
        <>
          <label className="asset-control-select">
            <span>排序字段</span>
            <select value={assetSortKey} onChange={(event) => onSortChange(event.target.value)}>
              {ASSET_SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <button className="asset-direction-button" onClick={onDirectionChange}>
            {assetSortDirection === "desc" ? "高 → 低" : "低 → 高"}
          </button>
        </>
      ) : (
        <div className="asset-axis-key"><span>横轴</span><b>Rel SPY 13W</b><span>纵轴</span><b>Switch Risk</b></div>
      )}
      <output>{resultCount} 个标的</output>
    </div>
  );
}

function AssetRankCardView({ definitions, onSelect, previewCandles, rows, selectedSymbol, sortKey, strategyMap }) {
  if (!rows.length) return <AssetEmptyState />;
  const sortLabel = ASSET_SORT_OPTIONS.find((option) => option.key === sortKey)?.label || sortKey;
  return (
    <div className="asset-grid asset-grid-preview asset-ranked-grid" data-testid="industry-view-a">
      {rows.map((row, index) => (
        <button
          key={row.symbol}
          className={`asset-tile asset-tile-preview asset-ranked-tile ${selectedSymbol === row.symbol ? "selected" : ""}`}
          style={{ "--accent": COLORS[row.code] }}
          onClick={() => onSelect(row.symbol)}
          data-testid={`full-asset-${row.displaySymbol}`}
        >
          <span className="asset-rank-marker">#{String(index + 1).padStart(2, "0")}</span>
          <span className="asset-sort-context">{sortLabel} <b className={assetMetricTone(row, sortKey)}>{formatAssetSortValue(row, sortKey)}</b></span>
          <AssetPreviewTileContent
            row={row}
            candle={previewCandles?.candles?.[row.symbol]}
            candleWeekEnd={previewCandles?.weekEnd}
            definition={definitions[row.code]}
            strategies={strategyMap?.[row.code]}
          />
        </button>
      ))}
    </div>
  );
}

function UnifiedIndustryWorkspace({ filteredRows, onSelect, onSort, rows, selectedSymbol, sortDirection, sortKey }) {
  if (!filteredRows.length) return <AssetEmptyState />;
  const activeSort = ASSET_SORT_OPTIONS.find((option) => option.key === sortKey)?.label || sortKey;
  return (
    <div className="unified-industry-workspace" data-testid="industry-view-merged">
      <AssetSignalStrip onSelect={onSelect} rows={filteredRows} selectedSymbol={selectedSymbol} />
      <div className="unified-industry-grid">
        <section className="unified-table-pane">
          <header className="unified-pane-head">
            <div><span>Primary View / Research Ledger</span><h4>横向研究表格</h4></div>
            <p>当前排序 <strong>{activeSort} {sortDirection === "desc" ? "↓" : "↑"}</strong></p>
          </header>
          <AssetResearchTable
            onSelect={onSelect}
            onSort={onSort}
            rows={rows}
            selectedSymbol={selectedSymbol}
            sortDirection={sortDirection}
            sortKey={sortKey}
          />
        </section>
        <aside className="unified-map-pane">
          <header className="unified-pane-head">
            <div><span>Structure View / Regime Field</span><h4>板块强弱地图</h4></div>
            <p>颜色 = Regime<br />大小 = Confidence</p>
          </header>
          <AssetRegimeMap compact onSelect={onSelect} rows={filteredRows} selectedSymbol={selectedSymbol} />
        </aside>
      </div>
    </div>
  );
}

function AssetSignalStrip({ onSelect, rows, selectedSymbol }) {
  const signalGroups = [
    {
      key: "leaders",
      eyebrow: "A / 快速扫描",
      title: "Rel SPY 领先",
      metric: "relativeToSpy13w",
      rows: [...rows].sort((left, right) => right.metrics.relativeToSpy13w - left.metrics.relativeToSpy13w).slice(0, 3)
    },
    {
      key: "laggards",
      eyebrow: "A / 快速扫描",
      title: "13W 落后",
      metric: "ret13w",
      rows: [...rows].sort((left, right) => left.metrics.ret13w - right.metrics.ret13w).slice(0, 3)
    },
    {
      key: "risk",
      eyebrow: "A / 快速扫描",
      title: "高切换风险",
      metric: "switchRisk",
      rows: [...rows].sort((left, right) => numberValue(right.transition?.pressure) - numberValue(left.transition?.pressure)).slice(0, 3)
    }
  ];
  return (
    <div className="asset-signal-strip" data-testid="merged-signal-strip">
      {signalGroups.map((group) => (
        <section key={group.key} className={`asset-signal-group ${group.key}`}>
          <header><span>{group.eyebrow}</span><strong>{group.title}</strong></header>
          <div>
            {group.rows.map((row, index) => (
              <button
                key={row.symbol}
                className={selectedSymbol === row.symbol ? "selected" : ""}
                style={{ "--accent": COLORS[row.code] }}
                onClick={() => onSelect(row.symbol)}
              >
                <i>{index + 1}</i>
                <span><b>{row.displaySymbol}</b><small>{row.labelZh}</small></span>
                <strong className={assetMetricTone(row, group.metric)}>{formatAssetSortValue(row, group.metric)}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssetResearchTable({ onSelect, onSort, rows, selectedSymbol, sortDirection, sortKey }) {
  useEffect(() => {
    const row = document.getElementById(`asset-research-row-${selectedSymbol}`);
    const wrapper = row?.closest(".asset-research-table-wrap");
    if (!row || !wrapper) return;
    wrapper.scrollTo({ top: Math.max(0, row.offsetTop - wrapper.clientHeight / 2), behavior: "smooth" });
  }, [selectedSymbol]);

  if (!rows.length) return <AssetEmptyState />;
  return (
    <div className="asset-research-table-wrap" data-testid="industry-view-b">
      <table className="asset-research-table">
        <thead>
          <tr>
            <th>#</th>
            <AssetSortHead label="标的" name="symbol" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="Regime" name="regime" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="1W" name="weeklyReturn" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="4W" name="ret4w" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="13W" name="ret13w" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="Rel SPY" name="relativeToSpy13w" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="Switch" name="switchRisk" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="20D Vol" name="realizedVol20" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="52W DD" name="drawdown52w" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
            <AssetSortHead label="Confidence" name="confidence" onSort={onSort} sortDirection={sortDirection} sortKey={sortKey} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr id={`asset-research-row-${row.symbol}`} key={row.symbol} className={selectedSymbol === row.symbol ? "selected" : ""} onClick={() => onSelect(row.symbol)}>
              <td>{String(index + 1).padStart(2, "0")}</td>
              <td><button onClick={() => onSelect(row.symbol)}><strong>{row.displaySymbol}</strong><span>{row.name}</span><em>{row.group}</em></button></td>
              <td><RegimeChip code={row.code} label={row.labelZh} /></td>
              <td className={tone(row.metrics.weeklyReturn)}>{formatSignedPercent(row.metrics.weeklyReturn)}</td>
              <td className={tone(row.metrics.ret4w)}>{formatSignedPercent(row.metrics.ret4w)}</td>
              <td className={tone(row.metrics.ret13w)}>{formatSignedPercent(row.metrics.ret13w)}</td>
              <td className={tone(row.metrics.relativeToSpy13w)}>{formatSignedPercent(row.metrics.relativeToSpy13w)}</td>
              <td className={transitionTone(row.transition)}>{formatPressure(row.transition?.pressure)}</td>
              <td>{formatPercent(row.metrics.realizedVol20)}</td>
              <td className={tone(row.metrics.drawdown52w)}>{formatPercent(row.metrics.drawdown52w)}</td>
              <td>{formatPercent(row.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetSortHead({ label, name, onSort, sortDirection, sortKey }) {
  const active = sortKey === name;
  const ariaSort = active ? (sortDirection === "desc" ? "descending" : "ascending") : "none";
  return (
    <th aria-sort={ariaSort}>
      <button className={active ? "active" : ""} onClick={() => onSort(name)}>
        <span>{label}</span>
        <i aria-hidden="true">{active ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</i>
      </button>
    </th>
  );
}

function AssetRegimeMap({ compact = false, onSelect, rows, selectedSymbol }) {
  if (!rows.length) return <AssetEmptyState />;
  const points = rows.map((row) => ({
    row,
    x: numberValue(row.metrics.relativeToSpy13w),
    y: numberValue(row.transition?.pressure)
  }));
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xMin = Math.min(...xValues, 0);
  const xMax = Math.max(...xValues, 0);
  const xMargin = Math.max((xMax - xMin) * 0.12, 0.02);
  const medianDistance = median(xValues.map((value) => Math.abs(value)));
  const yMax = Math.max(...yValues, 0.5);
  const yMedian = median(yValues);
  const left = 82;
  const right = 918;
  const top = 54;
  const bottom = 476;
  const sx = (value) => left + ((value - (xMin - xMargin)) / Math.max(xMax - xMin + xMargin * 2, 0.01)) * (right - left);
  const sy = (value) => bottom - (value / Math.max(yMax * 1.08, 0.01)) * (bottom - top);
  const zeroX = sx(0);
  const medianY = sy(yMedian);
  const selected = rows.find((row) => row.symbol === selectedSymbol) || rows[0];

  return (
    <div className={`asset-regime-map-layout ${compact ? "compact" : ""}`} data-testid={compact ? "merged-regime-map" : "industry-view-c"}>
      <div className="asset-regime-map">
        <svg viewBox="0 0 980 540" role="img" aria-label="行业相对强弱与 Regime 切换风险地图">
          <rect x={left} y={top} width={Math.max(zeroX - left, 0)} height={Math.max(medianY - top, 0)} className="map-zone weak-fragile" />
          <rect x={zeroX} y={top} width={Math.max(right - zeroX, 0)} height={Math.max(medianY - top, 0)} className="map-zone strong-fragile" />
          <rect x={left} y={medianY} width={Math.max(zeroX - left, 0)} height={Math.max(bottom - medianY, 0)} className="map-zone weak-stable" />
          <rect x={zeroX} y={medianY} width={Math.max(right - zeroX, 0)} height={Math.max(bottom - medianY, 0)} className="map-zone strong-stable" />
          <line x1={zeroX} x2={zeroX} y1={top} y2={bottom} className="map-benchmark" />
          <line x1={left} x2={right} y1={medianY} y2={medianY} className="map-benchmark median" />
          <line x1={left} x2={right} y1={bottom} y2={bottom} className="map-axis" />
          <line x1={left} x2={left} y1={top} y2={bottom} className="map-axis" />
          <text x={left + 14} y={top + 24} className="map-zone-label">弱势 / 高切换</text>
          <text x={zeroX + 14} y={top + 24} className="map-zone-label">强势 / 高切换</text>
          <text x={left + 14} y={bottom - 16} className="map-zone-label">弱势 / 稳定</text>
          <text x={zeroX + 14} y={bottom - 16} className="map-zone-label">强势 / 稳定</text>
          <text x={(left + right) / 2} y="526" textAnchor="middle" className="map-axis-label">相对 SPY 13W →</text>
          <text x="21" y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 21 ${(top + bottom) / 2})`} className="map-axis-label">Switch Risk →</text>
          <text x={zeroX + 7} y={bottom + 19} className="map-tick">0%</text>
          <text x={left - 8} y={medianY + 4} textAnchor="end" className="map-tick">中位 {formatPressure(yMedian)}</text>
          {points.map(({ row, x, y }, index) => {
            const active = row.symbol === selected.symbol;
            const radius = 7 + numberValue(row.confidence) * 6;
            const labelY = index % 3 === 0 ? -10 : index % 3 === 1 ? 15 : 3;
            const showLabel = active || y >= yMedian || Math.abs(x) >= medianDistance;
            return (
              <g
                key={row.symbol}
                className={`asset-map-point ${active ? "active" : ""}`}
                transform={`translate(${sx(x)} ${sy(y)})`}
                role="button"
                tabIndex="0"
                aria-label={`${row.displaySymbol}，${row.labelZh}，相对 SPY ${formatSignedPercent(x)}，切换风险 ${formatPressure(y)}`}
                onClick={() => onSelect(row.symbol)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(row.symbol); }}
              >
                <circle r="24" className="asset-map-hit" />
                <circle r={radius} fill={COLORS[row.code]} className="asset-map-dot" />
                {active ? <circle r={radius + 6} className="asset-map-ring" /> : null}
                <text className={showLabel ? "asset-map-label" : "asset-map-label deemphasized"} x={radius + 5} y={labelY}>{row.displaySymbol}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="asset-map-readout" style={{ "--accent": COLORS[selected.code] }}>
        <span>当前选择</span>
        <div><RegimeLogo code={selected.code} size={26} /><strong>{selected.displaySymbol}</strong></div>
        <h4>{selected.name}</h4>
        <RegimeChip code={selected.code} label={selected.labelZh} />
        <dl>
          <div><dt>Rel SPY 13W</dt><dd className={tone(selected.metrics.relativeToSpy13w)}>{formatSignedPercent(selected.metrics.relativeToSpy13w)}</dd></div>
          <div><dt>Switch Risk</dt><dd>{formatPressure(selected.transition?.pressure)}</dd></div>
          <div><dt>13W</dt><dd className={tone(selected.metrics.ret13w)}>{formatSignedPercent(selected.metrics.ret13w)}</dd></div>
          <div><dt>Confidence</dt><dd>{formatPercent(selected.confidence)}</dd></div>
        </dl>
        <p>坐标直接来自现有模型字段；颜色仍表示当前 Regime，点大小表示模型置信度。</p>
      </aside>
    </div>
  );
}

function AssetHistoryDrilldown({ asset, endWeek, market, period, selectedRow, setPeriod }) {
  if (!asset || !selectedRow) return null;
  const history = assetHistoryRows(asset, endWeek, period);
  const distribution = regimeDistribution(history);
  const transitions = recentRegimeTransitions(history);
  return (
    <section className="asset-history-drilldown" data-testid="asset-history" style={{ "--accent": COLORS[selectedRow.code] }}>
      <header className="asset-history-head">
        <div>
          <span>Asset Drill-down / 截止 {endWeek}</span>
          <h3><RegimeLogo code={selectedRow.code} size={24} />{asset.displaySymbol} · {asset.name}</h3>
          <p>从当前周向前查看价格相对表现、Regime 序列、状态占比与最近切换，不再只看一周。</p>
        </div>
        <div className="asset-history-periods" role="tablist" aria-label="资产历史区间">
          {["12W", "52W", "5Y"].map((item) => (
            <button key={item} role="tab" aria-selected={period === item} onClick={() => setPeriod(item)}>{item}</button>
          ))}
        </div>
      </header>
      <div className="asset-history-grid">
        <div className="asset-history-chart-block">
          <div className="asset-history-subhead"><strong>{asset.displaySymbol} vs SPY</strong><span>区间归一化表现</span></div>
          <AssetHistoryChart asset={asset} endWeek={endWeek} market={market} period={period} />
          <AssetRegimeRibbon history={history} />
        </div>
        <div className="asset-history-distribution">
          <div className="asset-history-subhead"><strong>Regime 占比</strong><span>{history.length} weeks</span></div>
          <div className="asset-distribution-list">
            {distribution.slice(0, 5).map((item) => (
              <div key={item.code} style={{ "--accent": COLORS[item.code] }}>
                <RegimeLogo code={item.code} size={18} />
                <span>{item.label}</span>
                <i><b style={{ width: `${item.share * 100}%` }} /></i>
                <strong>{formatPercent(item.share, 0)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="asset-history-transitions">
          <div className="asset-history-subhead"><strong>最近切换</strong><span>newest first</span></div>
          {transitions.length ? transitions.map((item) => (
            <div key={`${item.weekEnd}-${item.code}`}>
              <time>{item.weekEnd}</time>
              <RegimeChip code={item.code} label={item.labelZh} mini />
            </div>
          )) : <p>所选区间内没有 Regime 切换。</p>}
        </div>
      </div>
    </section>
  );
}

function AssetHistoryChart({ asset, endWeek, market, period }) {
  const assetRows = assetHistoryRows(asset, endWeek, period);
  const marketMap = new Map((market?.regimes || []).map((row) => [row.weekEnd, row]));
  const aligned = assetRows.map((row) => ({ asset: row, market: marketMap.get(row.weekEnd) })).filter((item) => item.market);
  if (aligned.length < 2) return <div className="asset-history-empty">历史数据不足</div>;
  const assetStart = numberValue(aligned[0].asset.metrics?.close, 1);
  const marketStart = numberValue(aligned[0].market.metrics?.close, 1);
  const assetSeries = aligned.map((item) => numberValue(item.asset.metrics?.close) / assetStart - 1);
  const marketSeries = aligned.map((item) => numberValue(item.market.metrics?.close) / marketStart - 1);
  const values = [...assetSeries, ...marketSeries, 0];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const margin = Math.max((rawMax - rawMin) * 0.12, 0.03);
  const min = rawMin - margin;
  const max = rawMax + margin;
  const width = 760;
  const height = 250;
  const left = 48;
  const right = 744;
  const top = 22;
  const bottom = 218;
  const sx = (index) => left + (index / Math.max(aligned.length - 1, 1)) * (right - left);
  const sy = (value) => top + ((max - value) / Math.max(max - min, 0.01)) * (bottom - top);
  const line = (series) => series.map((value, index) => `${index ? "L" : "M"}${sx(index).toFixed(1)},${sy(value).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => max - (max - min) * ratio);
  return (
    <svg className="asset-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${asset.displaySymbol} 与 SPY 的 ${period} 归一化表现`}>
      {ticks.map((tick) => <g key={tick}><line x1={left} x2={right} y1={sy(tick)} y2={sy(tick)} /><text x={left - 8} y={sy(tick) + 4} textAnchor="end">{formatPercent(tick, 0)}</text></g>)}
      <path d={line(marketSeries)} className="asset-history-market-line" />
      <path d={line(assetSeries)} className="asset-history-asset-line" />
      <g className="asset-history-legend"><circle cx="60" cy="12" r="3" /><text x="68" y="16">{asset.displaySymbol}</text><line x1="142" x2="164" y1="12" y2="12" /><text x="171" y="16">SPY</text></g>
      <text x={left} y="244">{aligned[0].asset.weekEnd.slice(0, 7)}</text>
      <text x={right} y="244" textAnchor="end">{aligned.at(-1).asset.weekEnd.slice(0, 7)}</text>
    </svg>
  );
}

function AssetRegimeRibbon({ history }) {
  return (
    <div className="asset-regime-ribbon">
      <span>Regime 序列</span>
      <div>{history.map((row) => <i key={row.weekEnd} style={{ background: COLORS[row.code] }} title={`${row.weekEnd} · ${row.labelZh}`} />)}</div>
      <small>{history[0]?.weekEnd} → {history.at(-1)?.weekEnd}</small>
    </div>
  );
}

function AssetEmptyState() {
  return <div className="asset-empty-state"><strong>当前筛选没有标的</strong><span>调整资产范围或 Regime 条件后重新查看。</span></div>;
}

function AssetPreviewTileContent({ row, candle, candleWeekEnd = null, definition, strategies }) {
  const explainer = REGIME_EXPLAINERS[row.code] || {};
  const tooltipId = `asset-regime-tip-${row.symbol}`;

  return (
    <span className="asset-preview-layout">
      <span className="asset-preview-identity">
        <span className="asset-preview-heading">
          <strong>{row.displaySymbol}</strong>
          <span className="asset-preview-regime" aria-describedby={tooltipId}>
            <span className="asset-preview-regime-text">{row.labelZh}</span>
            <span className="asset-regime-tooltip" id={tooltipId} role="tooltip">
              <strong>{definition?.labelZh || row.labelZh}</strong>
              <em>{definition?.label || row.label}</em>
              <span>{explainer.signal || definition?.thesis || row.thesis}</span>
              <span>观察：{explainer.metrics || row.drivers?.slice(0, 2).join(" / ") || "-"}</span>
              <b>适合：{strategies?.best?.slice(0, 2).join(" / ") || "查看 Regime 说明表"}</b>
            </span>
          </span>
        </span>
        <span className="asset-preview-name">{row.name}</span>
        <em>{row.group}</em>
      </span>

      <span className="asset-preview-chart">
        <MiniCandlestickStrip candle={candle} variant="wide" />
        <span className="asset-candle-meta">{candleWeekEnd && candleWeekEnd !== row.weekEnd ? `日 K · 截至 ${formatShortDate(candleWeekEnd)}` : "本周日 K"}</span>
      </span>

      <span className="asset-preview-metrics">
        <span>
          <i>振幅</i>
          <b>{formatPercent(row.metrics.weekRange)}</b>
        </span>
        <span>
          <i>周涨跌</i>
          <b className={tone(row.metrics.weeklyReturn)}>{formatSignedPercent(row.metrics.weeklyReturn)}</b>
        </span>
        <span>
          <i>13W</i>
          <b className={tone(row.metrics.ret13w)}>{formatSignedPercent(row.metrics.ret13w)}</b>
        </span>
      </span>
    </span>
  );
}

function MiniCandlestickStrip({ candle, variant = "compact" }) {
  const bars = candle?.bars || [];
  const [activeIndex, setActiveIndex] = useState(null);
  if (!bars.length) {
    return <span className={`mini-candle ${variant} loading`}>加载中</span>;
  }

  const isWide = variant === "wide";
  const viewWidth = isWide ? 236 : 46;
  const viewHeight = isWide ? 84 : 40;
  const chartLeft = isWide ? 30 : 5;
  const chartRight = isWide ? 8 : 5;
  const chartTop = isWide ? 8 : 6;
  const chartBottom = isWide ? 23 : 6;
  const chartBottomY = viewHeight - chartBottom;
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  const yTicks = isWide ? priceTicks(low, high) : [];
  const domainLow = yTicks[0] ?? low;
  const domainHigh = yTicks.at(-1) ?? high;
  const range = domainHigh - domainLow || 1;
  const scaleY = (value) => chartBottomY - ((value - low) / range) * (chartBottomY - chartTop);
  const step = (viewWidth - chartLeft - chartRight) / Math.max(bars.length, 1);
  const scaleDomainY = (value) => chartBottomY - ((value - domainLow) / range) * (chartBottomY - chartTop);
  const yScale = isWide ? scaleDomainY : scaleY;
  const bodyWidth = Math.min(isWide ? 18 : 7, Math.max(isWide ? 10 : 4, step * 0.42));
  const activeBar = Number.isInteger(activeIndex) ? bars[activeIndex] : null;
  const activeReturn = activeBar ? dailyReturn(activeBar, bars[activeIndex - 1]) : null;
  const activeX = activeBar ? chartLeft + step * activeIndex + step / 2 : viewWidth / 2;

  return (
    <span
      className={`mini-candle ${variant} strip`}
      aria-label={bars.map((bar, index) => `${bar.date} 涨跌 ${formatSignedPercent(dailyReturn(bar, bars[index - 1]))}, O ${bar.open}, H ${bar.high}, L ${bar.low}, C ${bar.close}`).join("; ")}
      onPointerLeave={() => setActiveIndex(null)}
      onMouseLeave={() => setActiveIndex(null)}
    >
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-hidden="true">
        {isWide ? (
          <>
            {yTicks.map((tick, index) => {
              const y = scaleDomainY(tick);
              return (
                <g key={tick}>
                  <text className="mini-candle-axis-label" x="6" y={y + 4}>
                    {formatAxisPrice(tick)}
                  </text>
                  <line
                    className={index === 0 ? "mini-candle-axis-line" : "mini-candle-guide"}
                    x1={chartLeft}
                    x2={viewWidth - chartRight}
                    y1={y}
                    y2={y}
                  />
                </g>
              );
            })}
          </>
        ) : null}
        {bars.map((bar, index) => {
          const x = chartLeft + step * index + step / 2;
          const wickTop = yScale(bar.high);
          const wickBottom = yScale(bar.low);
          const bodyTop = yScale(Math.max(bar.open, bar.close));
          const bodyBottom = yScale(Math.min(bar.open, bar.close));
          const bodyHeight = Math.max(2, bodyBottom - bodyTop);
          const up = bar.close >= bar.open;
          return (
            <g key={bar.date} className={`${up ? "mini-candle-day up" : "mini-candle-day down"} ${activeIndex === index ? "active" : ""}`}>
              <rect
                className="mini-candle-hitbox"
                x={x - step / 2}
                y={chartTop - 5}
                width={step}
                height={chartBottomY - chartTop + 10}
                rx="3"
                onPointerEnter={() => setActiveIndex(index)}
                onPointerMove={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseMove={() => setActiveIndex(index)}
              />
              <line className="mini-candle-wick" x1={x} x2={x} y1={wickTop} y2={wickBottom} />
              <rect className="mini-candle-body" x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx={isWide ? "1" : "1.4"} />
              {isWide ? (
                <text className="mini-candle-date-label" x={x} y={viewHeight - 7}>
                  {formatShortDate(bar.date)}
                </text>
              ) : null}
            </g>
          );
        })}
        {activeBar ? <line className="mini-candle-crosshair" x1={activeX} x2={activeX} y1={chartTop} y2={chartBottomY} /> : null}
      </svg>
      {activeBar ? (
        <span className="mini-candle-tooltip" style={{ left: `${activeX}px` }} role="tooltip">
          <span className="mini-candle-tooltip-date">{formatShortDate(activeBar.date)}</span>
          <strong className={tone(activeReturn)}>日涨跌 {formatSignedPercent(activeReturn)}</strong>
          <span>O {formatPrice(activeBar.open)} H {formatPrice(activeBar.high)}</span>
          <span>L {formatPrice(activeBar.low)} C {formatPrice(activeBar.close)}</span>
        </span>
      ) : null}
    </span>
  );
}

function WeeklySummary({ summary, charts, latest, previous }) {
  const chartItems = summary.items.filter((item) => item.chartKey);
  return (
    <section className="weekly-summary-panel" aria-label="Weekly market overview" style={{ "--accent": COLORS[latest.code] }}>
      <div className="summary-overview-row">
        <div className={`summary-latest-card ${summary.widgets.regime ? "changed-widget" : ""}`}>
          <p className="eyebrow">Latest Regime</p>
          <h2>
            <RegimeLogo code={latest.code} size={42} />
            {latest.labelZh}
          </h2>
          <p>{latest.thesis}</p>
          {summary.widgets.regime ? <small className="widget-change-note">{summary.widgets.regime}</small> : null}
        </div>
        <div className="summary-copy">
          <p className="eyebrow">Weekly Summary</p>
          <h3>{summary.headline}</h3>
          <p>{summary.body}</p>
        </div>
      </div>
      <div className="summary-change-grid">
        {chartItems.map((item) => (
          <div
            key={item.label}
            className={`summary-change-card ${item.changed ? "changed-widget" : ""}`}
            tabIndex={SUMMARY_CARD_EXPLANATIONS[item.label] ? 0 : undefined}
          >
            <div className="summary-change-head">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            {charts[item.chartKey] ? <MicroChart config={charts[item.chartKey]} /> : null}
            <div className="summary-chart-copy">
              <small>{item.note}</small>
              {item.changeNote ? <small className="widget-change-note">{item.changeNote}</small> : null}
            </div>
            {SUMMARY_CARD_EXPLANATIONS[item.label] ? (
              <span className="metric-tooltip" role="tooltip">
                <b>{SUMMARY_CARD_EXPLANATIONS[item.label].title}</b>
                <em>{item.label}</em>
                <span>{SUMMARY_CARD_EXPLANATIONS[item.label].body}</span>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <span className="chart-attribution">Inline SVG charts render at first paint</span>
      <TransitionBlock row={latest} compact />
      {previous ? (
        <p className="summary-footnote">
          Compared with {previous.weekEnd}. Amber marks widgets whose state changed materially.
        </p>
      ) : null}
    </section>
  );
}

function MicroChart({ config }) {
  return (
    <div className={`micro-chart ${config.kind}`} aria-label={config.label}>
      <svg className="micro-chart-canvas" viewBox="0 0 260 128" role="img" aria-label={config.label} preserveAspectRatio="none">
        {renderMicroChart(config)}
      </svg>
      <em>{config.caption}</em>
    </div>
  );
}

function renderMicroChart(config) {
  if (config.kind === "candlestick") {
    return <MicroCandlesticks data={config.data} />;
  }
  if (config.kind === "histogram") {
    return <MicroHistogram data={config.data} yMin={config.yMin} />;
  }
  return <MicroLine data={config.data} highlightLast={config.highlightLast} yMax={config.yMax} yMin={config.yMin} />;
}

function MicroLine({ data, highlightLast, yMax, yMin }) {
  const points = scaleLinePoints(data, { yMax, yMin });
  if (points.length < 2) return null;
  const historyPath = pointsToPath(points);
  const lastPath = pointsToPath(points.slice(-2));
  return (
    <>
      <MicroAxis />
      <path className={highlightLast ? "micro-line muted" : "micro-line"} d={historyPath} />
      {highlightLast ? <path className="micro-line highlight" d={lastPath} /> : null}
      {highlightLast
        ? points.slice(-2).map((point) => <circle className="micro-point" cx={point.x} cy={point.y} key={`${point.x}-${point.y}`} r="3.2" />)
        : null}
    </>
  );
}

function MicroCandlesticks({ data }) {
  const values = data.flatMap((point) => [point.low, point.high]).filter(Number.isFinite);
  if (!values.length) return null;
  const { x, y } = chartScales(data.length, Math.min(...values), Math.max(...values));
  const bodyWidth = Math.max(5, Math.min(12, 180 / Math.max(1, data.length)));
  return (
    <>
      <MicroAxis />
      {data.map((point, index) => {
        const cx = x(index);
        const openY = y(point.open);
        const closeY = y(point.close);
        const highY = y(point.high);
        const lowY = y(point.low);
        const up = point.close >= point.open;
        const top = Math.min(openY, closeY);
        const bodyHeight = Math.max(3, Math.abs(closeY - openY));
        return (
          <g className={up ? "micro-candle up" : "micro-candle down"} key={point.time}>
            <line x1={cx} x2={cx} y1={highY} y2={lowY} />
            <rect height={bodyHeight} rx="1.4" width={bodyWidth} x={cx - bodyWidth / 2} y={top} />
          </g>
        );
      })}
    </>
  );
}

function MicroHistogram({ data, yMin = 0 }) {
  const values = data.map((point) => point.value).filter(Number.isFinite);
  if (!values.length) return null;
  const { x, y, bottom } = chartScales(data.length, yMin, Math.max(...values, yMin + 1));
  const barWidth = Math.max(5, Math.min(13, 180 / Math.max(1, data.length)));
  return (
    <>
      <MicroAxis />
      {data.map((point, index) => {
        const top = y(point.value);
        return (
          <rect
            className="micro-bar"
            fill={point.color || "#b9872f"}
            height={Math.max(2, bottom - top)}
            key={point.time}
            opacity={point.value > 0 ? 1 : 0.2}
            width={barWidth}
            x={x(index) - barWidth / 2}
            y={top}
          />
        );
      })}
    </>
  );
}

function MicroAxis() {
  return <line className="micro-axis" x1="10" x2="250" y1="116" y2="116" />;
}

function scaleLinePoints(data, options = {}) {
  const values = data.map((point) => point.value).filter(Number.isFinite);
  const min = options.yMin ?? Math.min(...values);
  const max = options.yMax ?? Math.max(...values);
  const { x, y } = chartScales(data.length, min, max);
  return data.map((point, index) => ({ x: x(index), y: y(point.value) })).filter((point) => Number.isFinite(point.y));
}

function chartScales(length, minValue, maxValue) {
  const left = 10;
  const right = 250;
  const top = 10;
  const bottom = 116;
  const span = Math.max(0.0001, maxValue - minValue);
  return {
    bottom,
    x: (index) => left + (index / Math.max(1, length - 1)) * (right - left),
    y: (value) => bottom - ((value - minValue) / span) * (bottom - top)
  };
}

function pointsToPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function ChatContent({ content }) {
  const blocks = String(content || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return null;

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 1 && lines.every((line) => /^([-*]|\d+\.)\s+/.test(line));
    if (isList) {
      return (
        <ul key={`block-${blockIndex}`}>
          {lines.map((line, lineIndex) => (
            <li key={`line-${lineIndex}`}>
              <InlineText text={line.replace(/^([-*]|\d+\.)\s+/, "")} />
            </li>
          ))}
        </ul>
      );
    }

    const headingMatch = block.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      return (
        <strong key={`block-${blockIndex}`} className="chat-subhead">
          <InlineText text={headingMatch[1]} />
        </strong>
      );
    }

    return (
      <p key={`block-${blockIndex}`}>
        <InlineText text={block.replace(/\n/g, " ")} />
      </p>
    );
  });
}

function InlineText({ text }) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function downloadChatTranscript(messages) {
  const timestamp = new Date().toISOString();
  const body = [
    "# RegimeAlpha 研究助手聊天记录",
    "",
    `导出时间：${timestamp}`,
    "",
    ...messages.map((message, index) => [
      `## ${index + 1}. ${message.role === "assistant" ? "Assistant" : "User"}`,
      "",
      String(message.content || "").trim() || "(empty)",
      ""
    ].join("\n"))
  ].join("\n");
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `regimealpha-chat-${timestamp.slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function PanelTitle({ title, meta }) {
  return (
    <div className="panel-title">
      <h3>{title}</h3>
      <span>{meta}</span>
    </div>
  );
}

function RegimeLegend({ definitions, strategyMap, activeCode, onSelect }) {
  return (
    <div className="regime-legend" aria-label="Regime color legend">
      {Object.entries(definitions)
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([code, definition]) => {
          const strategies = strategyMap?.[code];
          const explainer = REGIME_EXPLAINERS[code];
          return (
          <button
            type="button"
            className={`legend-item ${activeCode === code ? "active" : ""}`}
            key={code}
            style={{ "--accent": COLORS[code] }}
            onClick={() => onSelect(code)}
            aria-describedby={`legend-tip-${code}`}
          >
            <RegimeLogo code={code} size={24} />
            <span>{definition.labelZh}</span>
            <span className="legend-tooltip" id={`legend-tip-${code}`} role="tooltip">
              <strong>{definition.labelZh}</strong>
              <em>{definition.label}</em>
              <span>{explainer?.signal || definition.thesis}</span>
              <b>适合：{strategies?.best?.slice(0, 2).join(" / ") || "查看下方表格"}</b>
            </span>
          </button>
          );
        })}
    </div>
  );
}

function RegimeReference({ definitions, strategyMap, activeCode }) {
  const [expanded, setExpanded] = useState(false);
  const [referenceTooltip, setReferenceTooltip] = useState(null);
  const entries = Object.entries(definitions).sort(([, a], [, b]) => a.order - b.order);
  const activeDefinition = definitions[activeCode] || entries[0]?.[1];
  const activeExplainer = REGIME_EXPLAINERS[activeCode] || {};
  const referenceTooltipPosition = (clientX, clientY) => ({
    x: Math.max(12, Math.min(clientX + 14, window.innerWidth - 430)),
    y: Math.max(12, Math.min(clientY + 14, window.innerHeight - 330))
  });
  const showReferenceTooltip = (code, definition, explainer, event, fromFocus = false) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = fromFocus
      ? referenceTooltipPosition(rect.right, rect.top)
      : referenceTooltipPosition(event.clientX, event.clientY);
    setReferenceTooltip({
      ...position,
      code,
      labelZh: definition.labelZh,
      label: definition.label,
      signal: explainer.signal || definition.thesis,
      metrics: explainer.metrics || "-",
      items: buildObservationItems(explainer.metrics)
    });
  };
  const hideReferenceTooltip = () => setReferenceTooltip(null);

  return (
    <section className={`regime-reference ${expanded ? "expanded" : ""}`} aria-label="Regime reference table">
      <div className="reference-lead" style={{ "--accent": COLORS[activeCode] }}>
        <div>
          <span>Regime 说明表</span>
          <h4>
            <RegimeLogo code={activeCode} size={28} />
            {activeDefinition?.labelZh}
          </h4>
        </div>
        <p>{activeExplainer.posture || activeDefinition?.thesis}</p>
        <button
          type="button"
          className="reference-toggle"
          aria-expanded={expanded}
          aria-controls="regime-reference-table"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起表格" : "展开表格"}
        </button>
      </div>
      <div className="reference-table-wrap" id="regime-reference-table">
        <table className="reference-table">
          <thead>
            <tr>
              <th>Regime</th>
              <th>核心特征</th>
              <th>观察指标</th>
              <th>策略倾向</th>
              <th>主要避免</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([code, definition]) => {
              const strategies = strategyMap?.[code] || {};
              const explainer = REGIME_EXPLAINERS[code] || {};
              return (
                <tr key={code} className={activeCode === code ? "active-row" : ""}>
                  <td>
                    <RegimeChip code={code} label={definition.labelZh} />
                  </td>
                  <td>{explainer.signal || definition.thesis}</td>
                  <td>
                    <button
                      type="button"
                      className="reference-metrics-trigger"
                      onBlur={hideReferenceTooltip}
                      onFocus={(event) => showReferenceTooltip(code, definition, explainer, event, true)}
                      onMouseEnter={(event) => showReferenceTooltip(code, definition, explainer, event)}
                      onMouseLeave={hideReferenceTooltip}
                      onMouseMove={(event) => showReferenceTooltip(code, definition, explainer, event)}
                    >
                      {explainer.metrics || "-"}
                    </button>
                  </td>
                  <td>{strategies.best?.join(" / ") || "-"}</td>
                  <td>{strategies.avoid?.join(" / ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {referenceTooltip ? (
        <div className="reference-metrics-tooltip" role="tooltip" style={{ left: referenceTooltip.x, top: referenceTooltip.y }}>
          <div className="tooltip-kicker">
            <strong>{referenceTooltip.labelZh}</strong>
            <span>{referenceTooltip.label}</span>
          </div>
          <div className="reference-tooltip-title">观察指标怎么读</div>
          <p>{referenceTooltip.signal}</p>
          <div className="reference-tooltip-metrics">{referenceTooltip.metrics}</div>
          <dl>
            {referenceTooltip.items.map((item) => (
              <div key={item.term}>
                <dt>{item.term}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function buildObservationItems(metrics = "") {
  return metrics
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((term) => ({
      term,
      detail: OBSERVATION_METRIC_GLOSSARY[term] || "该指标用于辅助判断当前 regime 的方向、波动、相关性或微观结构状态。"
    }));
}

function RegimeChip({ code, label, mini = false }) {
  return (
    <span className={`regime-chip ${mini ? "mini" : ""}`} style={{ "--accent": COLORS[code] }}>
      <RegimeLogo code={code} size={mini ? 14 : 16} />
      {label}
    </span>
  );
}

function RegimeLogo({ code, size = 20, compact = false }) {
  return (
    <svg
      className={`regime-logo ${compact ? "compact" : ""}`}
      style={{ "--accent": COLORS[code], width: size, height: size }}
      viewBox="0 0 32 32"
      role="img"
      aria-label={code}
      focusable="false"
    >
      <rect className="logo-field" x="2" y="2" width="28" height="28" rx="7" />
      <RegimeMark code={code} />
    </svg>
  );
}

function RegimeMark({ code }) {
  switch (code) {
    case "bull_quiet":
      return (
        <>
          <path className="logo-line" d="M8 22H12V18H16V14H20V10H24" />
          <path className="logo-line fine" d="M8 25H24" />
        </>
      );
    case "bull_volatile":
      return (
        <>
          <path className="logo-line" d="M7 21C10 13 13 25 16 16S22 13 25 8" />
          <path className="logo-fill" d="M22 8H26V12Z" />
        </>
      );
    case "bear_quiet":
      return (
        <>
          <path className="logo-line" d="M8 10H12V14H16V18H20V22H24" />
          <path className="logo-line fine" d="M8 25H24" />
        </>
      );
    case "bear_volatile":
      return (
        <>
          <path className="logo-line" d="M8 8L14 14L17 11L24 24" />
          <path className="logo-fill" d="M21 24H26V19Z" />
          <path className="logo-line fine" d="M8 24H18" />
        </>
      );
    case "sideways_quiet":
      return (
        <>
          <path className="logo-line fine" d="M7 11H25M7 21H25" />
          <path className="logo-line" d="M8 16H24" />
        </>
      );
    case "sideways_volatile":
      return (
        <>
          <path className="logo-line" d="M7 16C9 7 12 25 15 16S21 7 25 16" />
          <path className="logo-line fine" d="M7 11H25M7 21H25" />
        </>
      );
    case "trend_accelerating":
      return (
        <>
          <path className="logo-line" d="M7 23L13 18L17 18L25 8" />
          <path className="logo-fill" d="M22 7H27V12Z" />
          <path className="logo-line fine" d="M8 12H15" />
        </>
      );
    case "mean_reverting":
      return (
        <>
          <path className="logo-line" d="M23 11A8 8 0 0 0 9 12" />
          <path className="logo-line" d="M9 21A8 8 0 0 0 23 20" />
          <path className="logo-fill" d="M8 8L13 9L10 13Z" />
          <path className="logo-fill" d="M24 24L19 23L22 19Z" />
        </>
      );
    case "stagflationary":
      return (
        <>
          <path className="logo-line" d="M10 23V9M10 9L7 12M10 9L13 12" />
          <path className="logo-line" d="M22 9V23M22 23L19 20M22 23L25 20" />
          <path className="logo-line fine" d="M14 16H18" />
        </>
      );
    case "microstructure_dislocation":
      return (
        <>
          <path className="logo-line fine" d="M8 9H14M18 9H24M8 16H12M20 16H24M8 23H15M18 23H24" />
          <path className="logo-line" d="M17 7L13 15L19 17L15 25" />
        </>
      );
    default:
      return <path className="logo-line" d="M8 16H24" />;
  }
}

function Metric({ label, value, tone: metricTone, change }) {
  const explanation = METRIC_EXPLANATIONS[label];
  return (
    <div className={`metric ${metricTone || ""} ${change ? "changed-widget" : ""}`} tabIndex={explanation ? 0 : undefined}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
      {change ? <small className="widget-change-note">{change}</small> : null}
      {explanation ? (
        <span className="metric-tooltip" role="tooltip">
          <b>{explanation.title}</b>
          <em>{label}</em>
          <span>{explanation.body}</span>
        </span>
      ) : null}
    </div>
  );
}

function TransitionBlock({ row, compact = false }) {
  const transition = row.transition;
  if (!transition) return null;
  const probabilities = Object.entries(transition.probabilities || {}).slice(0, compact ? 2 : 3);
  const likelyNext = transition.likelyNextLabelZh || REGIME_LABELS_ZH[transition.likelyNext] || transition.likelyNext;
  const baseline = row.baselineLabelZh || REGIME_LABELS_ZH[row.baselineCode] || row.labelZh;

  return (
    <div className={`transition-block ${compact ? "compact" : ""} ${transitionTone(transition)}`} style={{ "--accent": COLORS[transition.likelyNext] || COLORS[row.code] }}>
      <div className="transition-head">
        <span>TVTP proxy</span>
        <strong>{formatPressure(transition.pressure)}</strong>
      </div>
      <p>
        Baseline {baseline} → likely {likelyNext}
        {transition.probabilities?.[transition.likelyNext] ? ` (${formatPercent(transition.probabilities[transition.likelyNext])})` : ""}
      </p>
      {probabilities.length ? (
        <div className="transition-probs">
          {probabilities.map(([code, probability]) => (
            <span key={code}>
              {REGIME_LABELS_ZH[code] || code} {formatPercent(probability)}
            </span>
          ))}
        </div>
      ) : null}
      {transition.triggers?.length ? (
        <div className="transition-triggers">
          {transition.triggers.slice(0, compact ? 3 : 5).map((trigger) => (
            <span key={trigger}>{trigger}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StrategyBlock({ strategies }) {
  return (
    <div className="strategy-block">
      <h4>策略倾向</h4>
      <div>
        {strategies.best.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <p>{strategies.note}</p>
    </div>
  );
}

function Timeline({ rows, cumulative, selected, onSelect }) {
  const width = 980;
  const height = 230;
  const pad = 24;
  const min = Math.min(...cumulative.map((point) => point.value));
  const max = Math.max(...cumulative.map((point) => point.value));
  const x = (index) => pad + (index / Math.max(1, rows.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - ((value - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
  const path = cumulative.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const selectedIndex = rows.findIndex((row) => row.weekEnd === selected.weekEnd);

  return (
    <svg className="timeline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="SPY cumulative return timeline">
      <rect x="0" y="0" width={width} height={height} rx="8" />
      {rows.map((row, index) => (
        <rect
          key={row.weekEnd}
          x={x(index) - 1.5}
          y={height - 20}
          width="3"
          height="12"
          fill={COLORS[row.code]}
          opacity={row.weekEnd === selected.weekEnd ? 1 : 0.55}
          onClick={() => onSelect(row.weekEnd)}
        />
      ))}
      <path d={path} fill="none" stroke="#161a1d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {selectedIndex >= 0 ? <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1="18" y2={height - 18} stroke={COLORS[selected.code]} strokeWidth="2" /> : null}
      <text x={pad} y="28">0%</text>
      <text x={width - 150} y="28">SPY cumulative</text>
    </svg>
  );
}

function groupByYear(rows) {
  const map = new Map();
  for (const row of rows) {
    const year = row.weekEnd.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(row);
  }
  return [...map.entries()];
}

function buildCumulative(rows) {
  let value = 1;
  return rows.map((row) => {
    value *= 1 + (row.metrics.weeklyReturn || 0);
    return { date: row.weekEnd, value: value - 1 };
  });
}

function buildWeeklyChangeSummary(latest, previous) {
  if (!previous) {
    return {
      headline: `${latest.weekEnd} · ${latest.labelZh}`,
      body: "No prior week is available for change comparison.",
      widgets: {},
      items: [
        { label: "Regime", value: latest.labelZh, note: "Initial observation", changed: false, chartKey: null },
        { label: "Switch Risk", value: formatPressure(latest.transition?.pressure), note: "TVTP proxy", changed: false, chartKey: "switchRisk" }
      ]
    };
  }

  const currentPressure = latest.transition?.pressure ?? 0;
  const previousPressure = previous.transition?.pressure ?? 0;
  const regimeChanged = latest.code !== previous.code;
  const switchChanged = Math.abs(currentPressure - previousPressure) >= 15 || latest.transition?.status !== previous.transition?.status;
  const vixDelta = (latest.metrics.vixClose ?? 0) - (previous.metrics.vixClose ?? 0);
  const confidenceDelta = (latest.confidence ?? 0) - (previous.confidence ?? 0);
  const spy13wDelta = (latest.metrics.ret13w ?? 0) - (previous.metrics.ret13w ?? 0);
  const weeklyReturn = latest.metrics.weeklyReturn ?? 0;
  const distribution = latest.metrics.distributionDay ? `Distribution day on ${latest.metrics.distributionDate}` : "No distribution day";

  const widgets = {};
  if (regimeChanged) {
    widgets.regime = `Changed from ${previous.labelZh} to ${latest.labelZh}. Baseline was ${latest.baselineLabelZh || latest.labelZh}.`;
  }
  if (switchChanged || currentPressure >= 45) {
    widgets.switchRisk = `Was ${formatPressure(previousPressure)}, now ${formatPressure(currentPressure)}.`;
  }
  if (Math.abs(vixDelta) >= 2) {
    widgets.vix = `Was ${number(previous.metrics.vixClose, 1)}, now ${number(latest.metrics.vixClose, 1)}.`;
  }
  if (Math.abs(confidenceDelta) >= 0.1 || regimeChanged) {
    widgets.confidence = `Was ${formatPercent(previous.confidence)}, now ${formatPercent(latest.confidence)}.`;
  }
  if (Math.abs(spy13wDelta) >= 0.005) {
    widgets.spy13w = `Was ${formatPercent(previous.metrics.ret13w)}, now ${formatPercent(latest.metrics.ret13w)}.`;
  }

  const changePhrase = regimeChanged
    ? `${previous.labelZh} -> ${latest.labelZh}`
    : `${latest.labelZh} persisted`;
  const headline = `${latest.weekEnd}: ${changePhrase}`;
  const body = latest.transition?.switched
    ? `The TVTP proxy moved the week into ${latest.labelZh} with ${formatPressure(currentPressure)} switch pressure. ${distribution}.`
    : `The regime did not switch, but switch pressure is ${formatPressure(currentPressure)}. ${distribution}.`;

  return {
    headline,
    body,
    widgets,
    items: [
      {
        label: "Regime",
        value: regimeChanged ? `${previous.labelZh} -> ${latest.labelZh}` : latest.labelZh,
        note: regimeChanged ? widgets.regime : "No label change",
        changed: regimeChanged,
        chartKey: null
      },
      {
        label: "Switch Risk",
        value: `${formatPressure(previousPressure)} -> ${formatPressure(currentPressure)}`,
        note: latest.transition?.status || "stable",
        changeNote: widgets.switchRisk,
        changed: Boolean(widgets.switchRisk),
        chartKey: "switchRisk"
      },
      {
        label: "SPY 1W",
        value: formatPercent(weeklyReturn),
        note: weeklyReturn < 0 ? "Latest weekly selloff" : "Latest weekly return",
        changeNote: widgets.spy13w,
        changed: Math.abs(weeklyReturn) >= 0.015,
        chartKey: "spyCandle"
      },
      {
        label: "VIX",
        value: `${number(previous.metrics.vixClose, 1)} -> ${number(latest.metrics.vixClose, 1)}`,
        note: vixDelta >= 0 ? `+${number(vixDelta, 1)} WoW` : `${number(vixDelta, 1)} WoW`,
        changeNote: widgets.vix,
        changed: Boolean(widgets.vix),
        chartKey: "vix"
      },
      {
        label: "Volume Shock",
        value: latest.metrics.distributionDay ? `z=${number(latest.metrics.downVolumeZ20, 1)}` : "none",
        note: distribution,
        changeNote: latest.metrics.distributionDay ? "Single-day high-volume selloff detected." : null,
        changed: Boolean(latest.metrics.distributionDay),
        chartKey: "volumeShock"
      }
    ]
  };
}

function buildWeeklySummaryCharts(rows) {
  const history = rows.slice(-12);
  const recentHistory = rows.slice(-6);
  const candleData = history
    .map((row) => ({
      time: row.weekEnd,
      open: row.metrics.spyOpen,
      high: row.metrics.spyHigh,
      low: row.metrics.spyLow,
      close: row.metrics.spyClose
    }))
    .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite));

  return {
    spyCandle: {
      kind: "candlestick",
      label: "SPY weekly candlestick, last 12 weeks",
      caption: "SPY 12W candle",
      data: candleData
    },
    switchRisk: {
      kind: "line-hot",
      label: "Switch risk, last 6 weeks",
      caption: "TVTP 6W · last move",
      highlightLast: true,
      yMax: 100,
      yMin: 0,
      data: recentHistory
        .map((row) => ({ time: row.weekEnd, value: row.transition?.pressure }))
        .filter((row) => Number.isFinite(row.value))
    },
    vix: {
      kind: "line-hot",
      label: "VIX close, last 6 weeks",
      caption: "VIX 6W · last move",
      highlightLast: true,
      data: recentHistory
        .map((row) => ({ time: row.weekEnd, value: row.metrics.vixClose }))
        .filter((row) => Number.isFinite(row.value))
    },
    volumeShock: {
      kind: "histogram",
      label: "Down-volume z-score, last 12 weeks",
      caption: "Down-volume z",
      yMin: 0,
      data: history
        .map((row) => {
          const shock = row.metrics.downVolumeZ20 ?? 0;
          return {
            time: row.weekEnd,
            value: Math.max(0, shock),
            color: shock >= 2 ? "#b9872f" : "rgba(113, 80, 21, 0.24)"
          };
        })
        .filter((row) => Number.isFinite(row.value))
    }
  };
}

function assetSortValue(row, key) {
  if (key === "symbol") return row.displaySymbol || row.symbol;
  if (key === "regime") return row.labelZh || row.code;
  if (key === "switchRisk") return numberValue(row.transition?.pressure);
  if (key === "confidence") return numberValue(row.confidence);
  return numberValue(row.metrics?.[key]);
}

function compareAssetRows(left, right, key) {
  const leftValue = assetSortValue(left, key);
  const rightValue = assetSortValue(right, key);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    const delta = String(leftValue).localeCompare(String(rightValue), "zh-CN");
    return delta || left.displaySymbol.localeCompare(right.displaySymbol);
  }
  const delta = leftValue - rightValue;
  return delta || left.displaySymbol.localeCompare(right.displaySymbol);
}

function formatAssetSortValue(row, key) {
  const value = assetSortValue(row, key);
  if (key === "symbol" || key === "regime") return value;
  if (key === "switchRisk") return formatPressure(value);
  if (["ret13w", "relativeToSpy13w", "weeklyReturn", "ret4w", "drawdown52w"].includes(key)) {
    return formatSignedPercent(value);
  }
  return formatPercent(value);
}

function assetMetricTone(row, key) {
  if (["ret13w", "relativeToSpy13w", "weeklyReturn", "ret4w", "drawdown52w"].includes(key)) {
    return tone(assetSortValue(row, key));
  }
  return "";
}

function assetHistoryRows(asset, endWeek, period) {
  const count = period === "12W" ? 12 : period === "52W" ? 52 : 261;
  const rows = asset?.regimes || [];
  let endIndex = rows.length - 1;
  while (endIndex > 0 && rows[endIndex].weekEnd > endWeek) endIndex -= 1;
  return rows.slice(Math.max(0, endIndex - count + 1), endIndex + 1);
}

function regimeDistribution(history) {
  const counts = new Map();
  for (const row of history) {
    const current = counts.get(row.code) || { code: row.code, label: row.labelZh, count: 0 };
    current.count += 1;
    counts.set(row.code, current);
  }
  return [...counts.values()]
    .map((item) => ({ ...item, share: history.length ? item.count / history.length : 0 }))
    .sort((left, right) => right.count - left.count);
}

function recentRegimeTransitions(history) {
  const transitions = [];
  for (let index = 1; index < history.length; index += 1) {
    if (history[index].code !== history[index - 1].code) transitions.push(history[index]);
  }
  return transitions.slice(-6).reverse();
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function numberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function downloadCsv(rows, assetRegimes = []) {
  const headers = ["scope", "symbol", "displaySymbol", "weekStart", "weekEnd", "regime", "regimeZh", "baselineRegime", "transitionPressure", "transitionStatus", "likelyNext", "confidence", "weeklyReturn", "ret13w", "relativeToSpy13w", "vix", "realizedVol20", "downVolumeZ20", "distributionDay", "correlationToSpy63"];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        "market",
        "SPY",
        "SPY",
        row.weekStart,
        row.weekEnd,
        row.label,
        row.labelZh,
        row.baselineCode || row.code,
        row.transition?.pressure ?? "",
        row.transition?.status ?? "",
        row.transition?.likelyNext ?? "",
        row.confidence,
        row.metrics.weeklyReturn,
        row.metrics.ret13w,
        0,
        row.metrics.vixClose,
        row.metrics.realizedVol20,
        row.metrics.downVolumeZ20,
        row.metrics.distributionDay,
        row.metrics.sectorCorrelation20
      ].join(",")
    ),
    ...assetRegimes.flatMap((asset) =>
      asset.regimes.map((row) =>
        [
          asset.group,
          asset.symbol,
          asset.displaySymbol,
          row.weekStart,
          row.weekEnd,
          row.label,
          row.labelZh,
          row.baselineCode || row.code,
          row.transition?.pressure ?? "",
          row.transition?.status ?? "",
          row.transition?.likelyNext ?? "",
          row.confidence,
          row.metrics.weeklyReturn,
          row.metrics.ret13w,
          row.metrics.relativeToSpy13w,
          row.metrics.vixClose,
          row.metrics.realizedVol20,
          row.metrics.downVolumeZ20,
          row.metrics.distributionDay,
          row.metrics.correlationToSpy63
        ].join(",")
      )
    )
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "regime-alpha-weekly.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "-";
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  return value >= 1000 ? value.toFixed(0) : value.toFixed(2);
}

function formatAxisPrice(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function priceTicks(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return [];
  const roughStep = (high - low) / 5;
  const step = niceStep(roughStep);
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks.length > 7 ? ticks.filter((_, index) => index % 2 === 0) : ticks;
}

function niceStep(value) {
  const exponent = Math.floor(Math.log10(value || 1));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function formatShortDate(value) {
  if (typeof value !== "string") return value || "-";
  const [, month, day] = value.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  return month && day ? `${month}/${day}` : value;
}

function dailyReturn(bar, previousBar) {
  if (Number.isFinite(bar?.dailyReturn)) return bar.dailyReturn;
  if (Number.isFinite(bar?.previousClose) && bar.previousClose) return bar.close / bar.previousClose - 1;
  if (Number.isFinite(previousBar?.close) && previousBar.close) return bar.close / previousBar.close - 1;
  if (Number.isFinite(bar?.open) && bar.open) return bar.close / bar.open - 1;
  return null;
}

function formatPressure(value) {
  return Number.isFinite(value) ? `${value.toFixed(0)}/100` : "-";
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function tone(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "good" : "bad";
}

function transitionTone(transition) {
  const pressure = typeof transition === "number" ? transition : transition?.pressure;
  if (!Number.isFinite(pressure)) return "";
  if (pressure >= 65) return "bad";
  if (pressure >= 45) return "warn";
  return "good";
}
