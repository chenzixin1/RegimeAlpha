"use client";

import { useMemo, useState } from "react";

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
  Market: {
    title: "市场 Regime",
    body: "同一周 SPY 市场层面的 regime 标签，用来对比当前资产与整体市场环境是否一致。"
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

export default function RegimeDashboard({ initialData }) {
  const [selectedWeek, setSelectedWeek] = useState(initialData.summary.latest.weekEnd);
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState("SOXX");
  const [heatmapKey, setHeatmapKey] = useState("MARKET");
  const [referenceCode, setReferenceCode] = useState(initialData.summary.latest.code);
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [heatmapTooltip, setHeatmapTooltip] = useState(null);

  const rows = initialData.regimes;
  const assetRegimes = initialData.assetRegimes || [];
  const definitions = initialData.regimeDefinitions;
  const latest = initialData.summary.latest;
  const selected = rows.find((row) => row.weekEnd === selectedWeek) || latest;
  const selectedAsset = assetRegimes.find((asset) => asset.symbol === selectedAssetSymbol) || assetRegimes[0];
  const selectedAssetRow = selectedAsset?.regimes.find((row) => row.weekEnd === selected.weekEnd) || selectedAsset?.regimes.at(-1);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="kicker">RegimeAlpha / US Equities</p>
          <h1>美股周度 Regime 地图</h1>
        </div>
        <div className="freshness">
          <span>数据截至</span>
          <strong>{initialData.metadata.dataThrough}</strong>
          <span>生成于 {formatDateTime(initialData.metadata.generatedAt)}</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="latest-panel" style={{ "--accent": COLORS[latest.code] }}>
          <div className="latest-copy">
            <p className="eyebrow">Latest</p>
            <h2>
              <RegimeLogo code={latest.code} size={42} />
              {latest.labelZh}
            </h2>
            <p>{latest.thesis}</p>
          </div>
          <div className="latest-metrics">
            <Metric label="Week" value={latest.weekEnd} />
            <Metric label="SPY 13W" value={formatPercent(latest.metrics.ret13w)} tone={tone(latest.metrics.ret13w)} />
            <Metric label="VIX" value={number(latest.metrics.vixClose, 1)} />
            <Metric label="Confidence" value={formatPercent(latest.confidence)} />
          </div>
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
            strategyMap={initialData.strategyMap}
            activeCode={referenceCode}
            onSelect={setReferenceCode}
          />
          <RegimeReference definitions={definitions} strategyMap={initialData.strategyMap} activeCode={referenceCode} />
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

        <section className="asset-panel">
          <PanelTitle title="行业 / 产业 Regime" meta={`${selected.weekEnd} · ${assetRowsForWeek.length} proxies`} />
          <div className="asset-grid">
            {assetRowsForWeek.map((row) => (
              <button
                key={row.symbol}
                className={`asset-tile ${selectedAssetRow?.symbol === row.symbol ? "selected" : ""}`}
                style={{ "--accent": COLORS[row.code] }}
                onClick={() => setSelectedAssetSymbol(row.symbol)}
                title={`${row.displaySymbol} ${row.name} · ${row.labelZh}`}
              >
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
                  <b className={tone(row.metrics.relativeToSpy13w)}>{formatPercent(row.metrics.relativeToSpy13w)}</b>
                </span>
              </button>
            ))}
          </div>
          {soxSelected && igvSelected ? (
            <div className="split-callout">
              <span>SOX: {soxSelected.labelZh} / 13W {formatPercent(soxSelected.metrics.ret13w)}</span>
              <span>IGV: {igvSelected.labelZh} / 13W {formatPercent(igvSelected.metrics.ret13w)}</span>
              <strong>{soxSelected.code === igvSelected.code ? "同 regime" : "分化 regime"}</strong>
            </div>
          ) : null}
        </section>

        <aside className="detail-panel" style={{ "--accent": COLORS[selected.code] }}>
          <PanelTitle
            title={
              <>
                <RegimeLogo code={selected.code} size={24} />
                {selected.labelZh}
              </>
            }
            meta={selected.weekEnd}
          />
          <p className="detail-thesis">{selected.thesis}</p>
          <div className="driver-list">
            {selected.drivers.map((driver) => (
              <span key={driver}>{driver}</span>
            ))}
          </div>
          <div className="metric-grid compact">
            <Metric label="1W" value={formatPercent(selected.metrics.weeklyReturn)} tone={tone(selected.metrics.weeklyReturn)} />
            <Metric label="4W" value={formatPercent(selected.metrics.ret4w)} tone={tone(selected.metrics.ret4w)} />
            <Metric label="20D Vol" value={formatPercent(selected.metrics.realizedVol20)} />
            <Metric label="Corr" value={number(selected.metrics.sectorCorrelation20, 2)} />
            <Metric label="Eq/Bond" value={number(selected.metrics.equityBondCorrelation63, 2)} />
            <Metric label="DD 52W" value={formatPercent(selected.metrics.drawdown52w)} tone="bad" />
          </div>
          <StrategyBlock strategies={selected.strategies} />
          {selectedAssetRow ? (
            <div className="asset-detail" style={{ "--accent": COLORS[selectedAssetRow.code] }}>
              <div className="asset-detail-title">
                <h4>
                  <RegimeLogo code={selectedAssetRow.code} size={22} />
                  {selectedAssetRow.displaySymbol} · {selectedAssetRow.name}
                </h4>
                <span>{selectedAssetRow.labelZh}</span>
              </div>
              {selectedAsset?.proxyNote ? <p className="proxy-note">{selectedAsset.proxyNote}</p> : null}
              <div className="driver-list">
                {selectedAssetRow.drivers.map((driver) => (
                  <span key={driver}>{driver}</span>
                ))}
              </div>
              <div className="metric-grid compact">
                <Metric label="13W" value={formatPercent(selectedAssetRow.metrics.ret13w)} tone={tone(selectedAssetRow.metrics.ret13w)} />
                <Metric label="Rel SPY" value={formatPercent(selectedAssetRow.metrics.relativeToSpy13w)} tone={tone(selectedAssetRow.metrics.relativeToSpy13w)} />
                <Metric label="20D Vol" value={formatPercent(selectedAssetRow.metrics.realizedVol20)} />
                <Metric label="Corr SPY" value={number(selectedAssetRow.metrics.correlationToSpy63, 2)} />
                <Metric label="Market" value={selected.labelZh} />
                <Metric label="Confidence" value={formatPercent(selectedAssetRow.confidence)} />
              </div>
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
          <PanelTitle title="模型口径" meta={initialData.metadata.model} />
          <div className="method-grid">
            {initialData.metadata.methodology.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
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

function Metric({ label, value, tone: metricTone }) {
  const explanation = METRIC_EXPLANATIONS[label];
  return (
    <div className={`metric ${metricTone || ""}`} tabIndex={explanation ? 0 : undefined}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
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

function downloadCsv(rows, assetRegimes = []) {
  const headers = ["scope", "symbol", "displaySymbol", "weekStart", "weekEnd", "regime", "regimeZh", "confidence", "weeklyReturn", "ret13w", "relativeToSpy13w", "vix", "realizedVol20", "correlationToSpy63"];
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
        row.confidence,
        row.metrics.weeklyReturn,
        row.metrics.ret13w,
        0,
        row.metrics.vixClose,
        row.metrics.realizedVol20,
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
          row.confidence,
          row.metrics.weeklyReturn,
          row.metrics.ret13w,
          row.metrics.relativeToSpy13w,
          row.metrics.vixClose,
          row.metrics.realizedVol20,
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

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
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
