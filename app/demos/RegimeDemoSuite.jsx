"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import styles from "./RegimeDemoSuite.module.css";

const VARIANT_META = {
  a: { label: "A", title: "排名卡片型", note: "先扫榜，再下钻" },
  b: { label: "B", title: "研究表格型", note: "先比较，再审计" },
  c: { label: "C", title: "四象限地图型", note: "先发现，再验证" }
};

const HORIZONS = {
  "1W": { metric: "weeklyReturn", label: "1W" },
  "4W": { metric: "ret4w", label: "4W" },
  "13W": { metric: "ret13w", label: "13W" },
  "26W": { metric: "ret26w", label: "26W" }
};

const SORTS = [
  ["composite", "综合分"],
  ["trend", "趋势"],
  ["relative", "相对 SPY"],
  ["improvement", "改善最快"],
  ["risk", "风险最高"],
  ["return", "区间收益"]
];

const GROUPS = ["all", "Core", "Sector", "Industry", "Theme", "International"];

const STATE_META = {
  strong_stable: { label: "强且稳", tone: "#15724d", soft: "#e9f5ee", insight: "趋势与稳定性同时占优，适合继续跟踪相对强势。" },
  strong_fragile: { label: "强但脆", tone: "#c06d05", soft: "#fff3df", insight: "中期趋势仍强，但短期波动与切换压力显著升高。" },
  weak_improving: { label: "弱势改善", tone: "#286f9b", soft: "#eaf3f8", insight: "绝对趋势尚未转强，但边际改善已经进入同组前列。" },
  weak_deteriorating: { label: "弱且恶化", tone: "#b73e39", soft: "#faecea", insight: "趋势、稳定性与排名同步走弱，优先控制暴露。" }
};

const REGIME_COLORS = {
  bull_quiet: "#2f9b68",
  bull_volatile: "#91b72f",
  bear_quiet: "#bd5c57",
  bear_volatile: "#e24c3f",
  sideways_quiet: "#8c8d7c",
  sideways_volatile: "#c88a19",
  trend_accelerating: "#2786bd",
  mean_reverting: "#8a62c7",
  stagflationary: "#956828",
  microstructure_dislocation: "#303337"
};

export default function RegimeDemoSuite({ initialData, variant }) {
  const [horizon, setHorizon] = useState("13W");
  const [group, setGroup] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortKey, setSortKey] = useState("composite");
  const [selectedSymbol, setSelectedSymbol] = useState("SOXX");
  const [period, setPeriod] = useState("52W");
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const ranking = useMemo(() => buildRanking(initialData, horizon), [horizon, initialData]);
  const visible = useMemo(() => {
    const filtered = ranking.filter((item) => {
      const groupMatch = group === "all" || item.displayGroup === group;
      const stateMatch = stateFilter === "all" || item.state === stateFilter;
      const queryMatch =
        !deferredQuery ||
        item.displaySymbol.toLowerCase().includes(deferredQuery) ||
        item.name.toLowerCase().includes(deferredQuery) ||
        item.displayGroup.toLowerCase().includes(deferredQuery);
      return groupMatch && stateMatch && queryMatch;
    });
    return [...filtered].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
  }, [deferredQuery, group, ranking, sortKey, stateFilter]);

  const selected = ranking.find((item) => item.symbol === selectedSymbol) || ranking[0];
  const controls = {
    group,
    horizon,
    setGroup: (value) => startTransition(() => setGroup(value)),
    setHorizon: (value) => startTransition(() => setHorizon(value)),
    setSortKey,
    setStateFilter: (value) => startTransition(() => setStateFilter(value)),
    sortKey,
    stateFilter
  };

  return (
    <main className={styles.shell} data-testid={`demo-${variant}`}>
      <DemoHeader data={initialData} variant={variant} />
      <ControlBar {...controls} visibleCount={visible.length} />

      {variant === "a" ? (
        <CardVersion
          data={initialData}
          horizon={horizon}
          items={showAll ? visible : visible.slice(0, 12)}
          onSelect={setSelectedSymbol}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          showAll={showAll}
          toggleAll={() => setShowAll((value) => !value)}
          total={visible.length}
        />
      ) : null}

      {variant === "b" ? (
        <LedgerVersion
          data={initialData}
          horizon={horizon}
          items={visible}
          onSelect={setSelectedSymbol}
          period={period}
          query={query}
          selected={selected}
          setPeriod={setPeriod}
          setQuery={setQuery}
          setSortKey={setSortKey}
          sortKey={sortKey}
        />
      ) : null}

      {variant === "c" ? (
        <QuadrantVersion
          data={initialData}
          items={visible}
          onSelect={setSelectedSymbol}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
        />
      ) : null}
    </main>
  );
}

function DemoHeader({ data, variant }) {
  const meta = VARIANT_META[variant];
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <a href="/demos/" aria-label="返回三个 Demo 目录">RA</a>
        <div>
          <p>RegimeAlpha / Industry Lab</p>
          <h1>行业与主题下钻</h1>
        </div>
      </div>
      <nav aria-label="Demo 版本">
        {Object.entries(VARIANT_META).map(([key, item]) => (
          <a key={key} href={`/demos/${key}/`} aria-current={key === variant ? "page" : undefined}>
            <b>{item.label}</b>
            <span>{item.title}</span>
          </a>
        ))}
      </nav>
      <div className={styles.freshness}>
        <span>{meta.note}</span>
        <strong>{data.metadata.dataThrough}</strong>
        <em>{data.assetRegimes.length} proxies · 5Y weekly</em>
      </div>
    </header>
  );
}

function ControlBar({ group, horizon, setGroup, setHorizon, setSortKey, setStateFilter, sortKey, stateFilter, visibleCount }) {
  return (
    <section className={styles.controls} aria-label="行业排序控制">
      <div className={styles.controlGroup}>
        <span>范围</span>
        <div className={styles.segmented}>
          {GROUPS.map((item) => (
            <button key={item} className={group === item ? styles.active : ""} onClick={() => setGroup(item)}>
              {item === "all" ? "全部" : item}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.controlGroup}>
        <span>周期</span>
        <div className={styles.segmented}>
          {Object.keys(HORIZONS).map((item) => (
            <button key={item} className={horizon === item ? styles.active : ""} onClick={() => setHorizon(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <label className={styles.selectControl}>
        <span>排序</span>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
          {SORTS.map(([key, label]) => <option key={key} value={key}>{label} ↓</option>)}
        </select>
      </label>
      <div className={styles.stateFilters}>
        <button className={stateFilter === "all" ? styles.active : ""} onClick={() => setStateFilter("all")}>全部状态</button>
        {Object.entries(STATE_META).map(([key, item]) => (
          <button
            key={key}
            className={stateFilter === key ? styles.active : ""}
            onClick={() => setStateFilter(key)}
            style={{ "--state-tone": item.tone }}
          >
            <i />{item.label}
          </button>
        ))}
      </div>
      <output>{visibleCount} 个标的</output>
    </section>
  );
}

function CardVersion({ data, horizon, items, onSelect, period, selected, setPeriod, showAll, toggleAll, total }) {
  return (
    <>
      <section className={styles.sectionHead}>
        <div><p>Version A / Ranked Cards</p><h2>从好到坏，一眼扫完</h2></div>
        <button onClick={toggleAll}>{showAll ? "收起至前 12" : `展开全部 ${total}`}</button>
      </section>
      <section className={styles.rankGrid} aria-label="行业综合排名">
        {items.map((item, index) => (
          <RankCard key={item.symbol} horizon={horizon} index={index} item={item} onSelect={onSelect} selected={selected.symbol === item.symbol} />
        ))}
      </section>
      <DetailPanel data={data} item={selected} period={period} setPeriod={setPeriod} />
    </>
  );
}

function RankCard({ horizon, index, item, onSelect, selected }) {
  const state = STATE_META[item.state];
  return (
    <button
      className={`${styles.rankCard} ${selected ? styles.selectedCard : ""}`}
      data-testid={`asset-${item.displaySymbol}`}
      onClick={() => onSelect(item.symbol)}
      style={{ "--card-index": index, "--state-soft": state.soft, "--state-tone": state.tone }}
    >
      <span className={styles.cardTopline}>
        <b>#{pad(item.rank)}</b>
        <strong>{item.displaySymbol}</strong>
        <em>{state.label}</em>
      </span>
      <span className={styles.cardName}>{item.name}<i>{item.displayGroup}</i></span>
      <span className={styles.cardChart}>
        <Sparkline values={item.sparkline} tone={state.tone} />
        <span><small>综合</small><b>{item.composite}</b></span>
      </span>
      <span className={styles.cardMetrics}>
        <MetricCell label={horizon} value={formatPercent(item.periodReturn)} tone={item.periodReturn} />
        <MetricCell label="Rel SPY" value={formatPercent(item.relative)} tone={item.relative} />
        <MetricCell label="排名" value={rankDelta(item.rankDelta)} tone={item.rankDelta} />
      </span>
    </button>
  );
}

function LedgerVersion({ data, horizon, items, onSelect, period, query, selected, setPeriod, setQuery, setSortKey, sortKey }) {
  return (
    <>
      <section className={styles.sectionHead}>
        <div><p>Version B / Research Ledger</p><h2>像研究员一样横向审计</h2></div>
        <label className={styles.search}><span>筛选标的</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="代码 / 名称 / 分组" /></label>
      </section>
      <section className={styles.ledgerLayout}>
        <div className={styles.tableWrap}>
          <table className={styles.ledgerTable}>
            <thead><tr>
              <th>#</th><th>标的</th><th>状态</th>
              <SortHead label="综合" name="composite" current={sortKey} onSort={setSortKey} />
              <SortHead label="趋势" name="trend" current={sortKey} onSort={setSortKey} />
              <SortHead label="稳定" name="stability" current={sortKey} onSort={setSortKey} />
              <SortHead label="改善" name="improvement" current={sortKey} onSort={setSortKey} />
              <SortHead label={horizon} name="return" current={sortKey} onSort={setSortKey} />
              <SortHead label="Rel SPY" name="relative" current={sortKey} onSort={setSortKey} />
              <SortHead label="风险" name="risk" current={sortKey} onSort={setSortKey} />
              <th>排名变化</th>
            </tr></thead>
            <tbody>
              {items.map((item) => {
                const state = STATE_META[item.state];
                return (
                  <tr key={item.symbol} className={selected.symbol === item.symbol ? styles.activeRow : ""} onClick={() => onSelect(item.symbol)}>
                    <td>{pad(item.rank)}</td>
                    <td><button onClick={() => onSelect(item.symbol)}><strong>{item.displaySymbol}</strong><span>{item.name}</span><em>{item.displayGroup}</em></button></td>
                    <td><i className={styles.statePill} style={{ "--state-tone": state.tone, "--state-soft": state.soft }}>{state.label}</i></td>
                    <td><ScoreNumber value={item.composite} /></td>
                    <td>{item.trend}</td><td>{item.stability}</td><td>{item.improvement}</td>
                    <td className={toneClass(item.periodReturn)}>{formatPercent(item.periodReturn)}</td>
                    <td className={toneClass(item.relative)}>{formatPercent(item.relative)}</td>
                    <td>{item.risk}</td><td className={toneClass(item.rankDelta)}>{rankDelta(item.rankDelta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <LedgerDossier data={data} item={selected} period={period} setPeriod={setPeriod} />
      </section>
    </>
  );
}

function SortHead({ label, name, current, onSort }) {
  return <th><button aria-pressed={current === name} onClick={() => onSort(name)}>{label}{current === name ? " ↓" : ""}</button></th>;
}

function LedgerDossier({ data, item, period, setPeriod }) {
  const asset = data.assetRegimes.find((entry) => entry.symbol === item.symbol);
  const market = data.assetRegimes.find((entry) => entry.symbol === "SPY");
  const history = periodHistory(asset, period);
  const state = STATE_META[item.state];
  return (
    <aside className={styles.dossier} data-testid="asset-detail" style={{ "--state-tone": state.tone }}>
      <header><span>Research Dossier</span><b>#{pad(item.rank)}</b></header>
      <div className={styles.dossierTitle}><strong>{item.displaySymbol}</strong><div><h2>{item.name}</h2><p>{item.row.labelZh} · {state.label}</p></div><ScoreNumber value={item.composite} /></div>
      <PeriodTabs period={period} setPeriod={setPeriod} />
      <PerformanceChart asset={asset} market={market} period={period} compact />
      <RegimeStrip history={history} />
      <ScoreBars item={item} />
      <p className={styles.insight}>{state.insight}</p>
      <div className={styles.driverTape}>{item.row.drivers.slice(0, 3).map((driver) => <span key={driver}>{driver}</span>)}</div>
    </aside>
  );
}

function QuadrantVersion({ data, items, onSelect, period, selected, setPeriod }) {
  return (
    <>
      <section className={styles.sectionHead}>
        <div><p>Version C / Regime Field</p><h2>把强弱和脆弱度放在一张地图上</h2></div>
        <div className={styles.axisNote}><span>横轴：趋势强弱</span><span>纵轴：稳定性</span><span>颜色：当前状态</span></div>
      </section>
      <section className={styles.quadrantPanel}>
        <QuadrantMap items={items} onSelect={onSelect} selected={selected} />
        <div className={styles.quadrantReadout}>
          <p>当前选择</p>
          <strong>#{pad(selected.rank)} {selected.displaySymbol}</strong>
          <span>{selected.name}</span>
          <i style={{ "--state-tone": STATE_META[selected.state].tone }}>{STATE_META[selected.state].label}</i>
          <dl><div><dt>趋势</dt><dd>{selected.trend}</dd></div><div><dt>稳定</dt><dd>{selected.stability}</dd></div><div><dt>改善</dt><dd>{selected.improvement}</dd></div><div><dt>风险</dt><dd>{selected.risk}</dd></div></dl>
          <p>{STATE_META[selected.state].insight}</p>
        </div>
      </section>
      <DetailPanel data={data} item={selected} period={period} setPeriod={setPeriod} compact />
    </>
  );
}

function QuadrantMap({ items, onSelect, selected }) {
  const x = (value) => 72 + value * 7.8;
  const y = (value) => 486 - value * 4.18;
  return (
    <div className={styles.quadrantMap}>
      <svg viewBox="0 0 900 540" role="img" aria-label="行业趋势与稳定性四象限地图">
        <rect x="72" y="68" width="390" height="209" className={styles.qDefensive} />
        <rect x="462" y="68" width="390" height="209" className={styles.qStrong} />
        <rect x="72" y="277" width="390" height="209" className={styles.qWeak} />
        <rect x="462" y="277" width="390" height="209" className={styles.qFragile} />
        {[0, 25, 50, 75, 100].map((tick) => <g key={`x-${tick}`}><line x1={x(tick)} x2={x(tick)} y1="68" y2="486" /><text x={x(tick)} y="514" textAnchor="middle">{tick}</text></g>)}
        {[0, 25, 50, 75, 100].map((tick) => <g key={`y-${tick}`}><line x1="72" x2="852" y1={y(tick)} y2={y(tick)} /><text x="52" y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <text x="80" y="91" className={styles.quadrantLabel}>防御 / 待确认</text>
        <text x="478" y="91" className={styles.quadrantLabel}>强且稳</text>
        <text x="80" y="304" className={styles.quadrantLabel}>弱且恶化</text>
        <text x="478" y="304" className={styles.quadrantLabel}>强但脆</text>
        <text x="462" y="533" textAnchor="middle" className={styles.axisLabel}>趋势强弱 →</text>
        <text x="17" y="277" textAnchor="middle" transform="rotate(-90 17 277)" className={styles.axisLabel}>稳定性 →</text>
        {items.map((item) => {
          const state = STATE_META[item.state];
          const active = selected.symbol === item.symbol;
          return (
            <g
              key={item.symbol}
              className={`${styles.plotPoint} ${active ? styles.activePoint : ""}`}
              aria-label={`${item.displaySymbol} · 趋势 ${item.trend} · 稳定 ${item.stability}`}
              onClick={() => onSelect(item.symbol)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(item.symbol); }}
              role="button"
              tabIndex="0"
              transform={`translate(${x(item.trend)} ${y(item.stability)})`}
            >
              <circle r="24" className={styles.pointHit} />
              <circle r={active ? 12 : 8 + item.row.confidence * 3} fill={state.tone} />
              {active ? <circle r="18" className={styles.pointRing} /> : null}
              <text x="13" y={item.rank % 2 ? -10 : 17}>{item.displaySymbol}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DetailPanel({ compact = false, data, item, period, setPeriod }) {
  const asset = data.assetRegimes.find((entry) => entry.symbol === item.symbol);
  const market = data.assetRegimes.find((entry) => entry.symbol === "SPY");
  const history = periodHistory(asset, period);
  const peers = buildRanking(data, "13W").filter((entry) => entry.displayGroup === item.displayGroup).slice(0, 6);
  const state = STATE_META[item.state];
  return (
    <section className={`${styles.detailPanel} ${compact ? styles.compactDetail : ""}`} data-testid="asset-detail" style={{ "--state-tone": state.tone, "--state-soft": state.soft }}>
      <header className={styles.detailHeader}>
        <div><span>#{pad(item.rank)}</span><strong>{item.displaySymbol}</strong><div><h2>{item.name}</h2><p>{item.row.labelZh} · {state.label}</p></div><ScoreNumber value={item.composite} /></div>
        <PeriodTabs period={period} setPeriod={setPeriod} />
      </header>
      <div className={styles.detailGrid}>
        <div className={styles.performanceBlock}>
          <h3>相对表现 · {item.displaySymbol} vs SPY</h3>
          <PerformanceChart asset={asset} market={market} period={period} />
          <RegimeStrip history={history} />
        </div>
        <div className={styles.factorBlock}><h3>因子得分</h3><ScoreBars item={item} /></div>
        <PeerTable peers={peers} selected={item} />
      </div>
      <footer className={styles.insightBar}><b>判断</b><span>{state.insight}</span><em>{item.row.drivers.slice(0, 2).join(" / ")}</em></footer>
    </section>
  );
}

function PeriodTabs({ period, setPeriod }) {
  return <div className={styles.periodTabs} role="tablist" aria-label="历史区间">{["12W", "52W", "5Y"].map((item) => <button key={item} role="tab" aria-selected={period === item} onClick={() => setPeriod(item)}>{item}</button>)}</div>;
}

function PerformanceChart({ asset, compact = false, market, period }) {
  const series = performanceSeries(asset, market, period);
  if (!series.asset.length) return <div className={styles.emptyChart}>历史数据不足</div>;
  const width = 720;
  const height = compact ? 190 : 250;
  const padX = 42;
  const padY = 18;
  const all = [...series.asset, ...series.market].map((point) => point.value);
  const rawMin = Math.min(...all, 0);
  const rawMax = Math.max(...all, 0);
  const margin = Math.max((rawMax - rawMin) * 0.1, 0.04);
  const min = rawMin - margin;
  const max = rawMax + margin;
  const sx = (index) => padX + (index / Math.max(series.asset.length - 1, 1)) * (width - padX - 14);
  const sy = (value) => padY + ((max - value) / Math.max(max - min, 0.01)) * (height - padY - 30);
  const line = (points) => points.map((point, index) => `${index ? "L" : "M"}${sx(index).toFixed(1)},${sy(point.value).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => max - (max - min) * ratio);
  return (
    <svg className={styles.performanceChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${asset.displaySymbol} 与 SPY 的 ${period} 归一化表现`}>
      {ticks.map((tick) => <g key={tick}><line x1={padX} x2={width - 14} y1={sy(tick)} y2={sy(tick)} /><text x={padX - 8} y={sy(tick) + 4} textAnchor="end">{formatPercent(tick, 0)}</text></g>)}
      <path d={line(series.market)} className={styles.marketLine} />
      <path d={line(series.asset)} className={styles.assetLine} />
      <g className={styles.chartLegend}><circle cx="55" cy="12" r="3" /><text x="64" y="16">{asset.displaySymbol}</text><line x1="125" x2="145" y1="12" y2="12" /><text x="152" y="16">SPY</text></g>
      <text x={padX} y={height - 7}>{series.asset[0].date.slice(0, 7)}</text>
      <text x={width - 14} y={height - 7} textAnchor="end">{series.asset.at(-1).date.slice(0, 7)}</text>
    </svg>
  );
}

function RegimeStrip({ history }) {
  return (
    <div className={styles.regimeHistory}>
      <span>Regime 历史</span>
      <div>{history.map((row) => <i key={row.weekEnd} style={{ background: REGIME_COLORS[row.code] || "#777" }} title={`${row.weekEnd} · ${row.labelZh}`} />)}</div>
      <small>{history[0]?.weekEnd} → {history.at(-1)?.weekEnd}</small>
    </div>
  );
}

function ScoreBars({ item }) {
  const bars = [["趋势", item.trend], ["相对强弱", Math.round(item.relativeScore)], ["稳定性", item.stability], ["改善度", item.improvement]];
  return <div className={styles.scoreBars}>{bars.map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value}</strong></div>)}</div>;
}

function PeerTable({ peers, selected }) {
  return (
    <div className={styles.peerBlock}><h3>同组比较</h3><table><thead><tr><th>标的</th><th>综合</th><th>13W</th><th>Rel SPY</th><th>风险</th><th>变化</th></tr></thead><tbody>
      {peers.map((peer) => <tr key={peer.symbol} className={peer.symbol === selected.symbol ? styles.peerSelected : ""}><td>{peer.displaySymbol}</td><td>{peer.composite}</td><td className={toneClass(peer.row.metrics.ret13w)}>{formatPercent(peer.row.metrics.ret13w)}</td><td className={toneClass(peer.relative)}>{formatPercent(peer.relative)}</td><td>{peer.risk}</td><td className={toneClass(peer.rankDelta)}>{rankDelta(peer.rankDelta)}</td></tr>)}
    </tbody></table></div>
  );
}

function MetricCell({ label, tone, value }) {
  return <span><small>{label}</small><b className={toneClass(tone)}>{value}</b></span>;
}

function ScoreNumber({ value }) {
  return <span className={styles.scoreNumber}><small>综合</small><strong>{value}</strong></span>;
}

function Sparkline({ tone, values }) {
  if (values.length < 2) return null;
  const width = 170;
  const height = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values.map((value, index) => {
    const x = 3 + (index / (values.length - 1)) * (width - 6);
    const y = 4 + ((max - value) / Math.max(max - min, 0.01)) * (height - 9);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><line x1="0" x2={width} y1={height - 4} y2={height - 4} /><path d={path} style={{ stroke: tone }} /></svg>;
}

function buildRanking(data, horizon) {
  const currentWeek = data.summary.latest.weekEnd;
  const priorWeek = data.regimes.at(-5)?.weekEnd || data.regimes[0].weekEnd;
  const current = scoreSnapshot(data.assetRegimes, currentWeek, horizon).sort((a, b) => b.composite - a.composite);
  const previous = scoreSnapshot(data.assetRegimes, priorWeek, horizon).sort((a, b) => b.composite - a.composite);
  const priorRank = new Map(previous.map((item, index) => [item.symbol, index + 1]));
  return current.map((item, index) => ({
    ...item,
    rank: index + 1,
    rankDelta: (priorRank.get(item.symbol) || index + 1) - (index + 1)
  }));
}

function scoreSnapshot(assets, weekEnd, horizon) {
  const metric = HORIZONS[horizon].metric;
  const rows = assets.map((asset) => {
    const index = rowIndexOnOrBefore(asset.regimes, weekEnd);
    const row = asset.regimes[index];
    const prior = asset.regimes[Math.max(0, index - 4)] || row;
    return {
      asset,
      displayGroup: normalizeGroup(asset.group),
      displaySymbol: asset.displaySymbol,
      index,
      name: asset.name,
      periodReturn: finite(row?.metrics?.[metric]),
      priorReturn: finite(prior?.metrics?.[metric]),
      relative: finite(row?.metrics?.relativeToSpy13w),
      row,
      symbol: asset.symbol
    };
  }).filter((item) => item.row);

  const primary = percentileMap(rows, (item) => item.periodReturn);
  const relative = percentileMap(rows, (item) => item.relative);
  const efficiency = percentileMap(rows, (item) => finite(item.row.metrics.trendEfficiency20));
  const volatility = percentileMap(rows, (item) => finite(item.row.metrics.realizedVol20), true);
  const drawdown = percentileMap(rows, (item) => finite(item.row.metrics.drawdown52w));
  const pressure = percentileMap(rows, (item) => finite(item.row.transition?.pressure), true);
  const confidence = percentileMap(rows, (item) => finite(item.row.confidence));
  const improvement = percentileMap(rows, (item) => item.periodReturn - item.priorReturn);
  const weekly = percentileMap(rows, (item) => finite(item.row.metrics.weeklyReturn));

  return rows.map((item) => {
    const ma = (item.row.metrics.aboveMa50 ? 50 : 0) + (item.row.metrics.aboveMa200 ? 50 : 0);
    const trend = roundScore(primary.get(item.symbol) * 0.48 + relative.get(item.symbol) * 0.27 + efficiency.get(item.symbol) * 0.15 + ma * 0.1);
    const stability = roundScore(volatility.get(item.symbol) * 0.3 + drawdown.get(item.symbol) * 0.3 + pressure.get(item.symbol) * 0.25 + confidence.get(item.symbol) * 0.15);
    const improvementScore = roundScore(improvement.get(item.symbol) * 0.65 + weekly.get(item.symbol) * 0.35);
    const composite = roundScore(trend * 0.55 + stability * 0.3 + improvementScore * 0.15);
    const state = trend >= 60 ? (stability >= 55 ? "strong_stable" : "strong_fragile") : (improvementScore >= 55 ? "weak_improving" : "weak_deteriorating");
    return {
      ...item,
      composite,
      improvement: improvementScore,
      relativeScore: relative.get(item.symbol),
      risk: 100 - stability,
      sparkline: item.asset.regimes.slice(Math.max(0, item.index - 15), item.index + 1).map((row) => finite(row.metrics.close)),
      stability,
      state,
      trend
    };
  });
}

function percentileMap(items, accessor, invert = false) {
  const values = items.map(accessor).filter(Number.isFinite).sort((a, b) => a - b);
  const map = new Map();
  for (const item of items) {
    const value = accessor(item);
    const index = values.findLastIndex((candidate) => candidate <= value);
    const raw = values.length <= 1 ? 50 : (Math.max(index, 0) / (values.length - 1)) * 100;
    map.set(item.symbol, invert ? 100 - raw : raw);
  }
  return map;
}

function performanceSeries(asset, market, period) {
  const history = periodHistory(asset, period);
  if (!history.length) return { asset: [], market: [] };
  const marketMap = new Map(market.regimes.map((row) => [row.weekEnd, row]));
  const aligned = history.map((row) => ({ asset: row, market: marketMap.get(row.weekEnd) })).filter((entry) => entry.market);
  const assetStart = finite(aligned[0]?.asset.metrics.close);
  const marketStart = finite(aligned[0]?.market.metrics.close);
  return {
    asset: aligned.map((entry) => ({ date: entry.asset.weekEnd, value: finite(entry.asset.metrics.close) / assetStart - 1 })),
    market: aligned.map((entry) => ({ date: entry.market.weekEnd, value: finite(entry.market.metrics.close) / marketStart - 1 }))
  };
}

function periodHistory(asset, period) {
  const count = period === "12W" ? 12 : period === "52W" ? 52 : 261;
  return asset?.regimes?.slice(-count) || [];
}

function rowIndexOnOrBefore(rows, weekEnd) {
  for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index].weekEnd <= weekEnd) return index;
  return 0;
}

function normalizeGroup(group) {
  if (group === "Custom") return "Theme";
  if (group === "Market" || group === "Style") return "Core";
  return group;
}

function sortValue(item, key) {
  if (key === "relative") return item.relative;
  if (key === "return") return item.periodReturn;
  return item[key] ?? item.composite;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function roundScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(digits)}%`;
}

function rankDelta(value) {
  if (!value) return "→ 0";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toneClass(value) {
  return value > 0 ? styles.positive : value < 0 ? styles.negative : styles.neutral;
}
