"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CORE_SYMBOLS = ["SPY", "QQQ", "SOXX", "^VIX", "TLT", "BTCUSD"];
const MEMORY_SYMBOLS = ["DRAM", "MU", "SNDK", "000660.KS", "005930.KS", "WDC", "STX"];
const OPTICAL_SYMBOLS = ["AAOI", "LITE", "COHR", "CIEN", "FN", "MTSI", "CRDO", "MRVL", "AVGO", "NOK", "CSCO", "SMTC"];
const DISPLAY_SYMBOLS = {
  BTCUSD: "BTC",
  "^VIX": "VIX"
};
const PULSE_HINTS = {
  pressure: {
    title: "Regime Pressure",
    body: "盘中数据对当前周度 regime 的挑战强度。它只做 nowcast 预警，不会改写正式周度标签。"
  },
  session: {
    title: "当前交易时段",
    body: "按交易所本地时间标记盘前、盘中、盘后或休市。FMP quote 返回的是当前可得快照，不保证每个市场都有完整扩展时段深度。"
  },
  relative: {
    title: "Rel SPY",
    body: "该标的当日涨跌幅减去 SPY 当日涨跌幅，用来观察是否强于或弱于大盘。"
  }
};
const PRESSURE_COLORS = {
  calm: "#18724f",
  watch: "#b38323",
  challenged: "#b65f5a",
  alert: "#b93635"
};
const REGIME_COLORS = {
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

export default function PulseDashboard({ anchor }) {
  const [pulse, setPulse] = useState(null);
  const [lastGood, setLastGood] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flashMap, setFlashMap] = useState({});
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const previousQuotes = useRef(new Map());
  const activePulse = pulse || lastGood;
  const refreshSeconds = activePulse?.refreshSeconds || 60;
  const secondsLeft = useCountdown(nextRefreshAt);

  const latestAssetMap = useMemo(
    () => new Map((anchor.latestAssets || []).map((asset) => [asset.symbol, asset])),
    [anchor.latestAssets]
  );

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/pulse?ts=${Date.now()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || `Pulse API ${response.status}`);
        }
        if (cancelled) return;

        const nextFlash = {};
        for (const quote of data.quotes || []) {
          const previous = previousQuotes.current.get(quote.symbol);
          if (previous && Number.isFinite(quote.price) && quote.price !== previous.price) {
            nextFlash[quote.symbol] = quote.price > previous.price ? "up" : "down";
          }
          previousQuotes.current.set(quote.symbol, quote);
        }

        setPulse(data);
        setLastGood(data);
        setError(null);
        setFlashMap(nextFlash);
        setNextRefreshAt(Date.now() + (data.refreshSeconds || 60) * 1000);
        window.setTimeout(() => setFlashMap({}), 850);
      } catch (nextError) {
        if (!cancelled) {
          setPulse(null);
          setError(nextError.message || "Pulse data unavailable");
          setNextRefreshAt(Date.now() + refreshSeconds * 1000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    timer = window.setInterval(load, refreshSeconds * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshSeconds]);

  const coreQuotes = CORE_SYMBOLS.map((symbol) => findQuote(activePulse, symbol)).filter(Boolean);
  const memoryQuotes = MEMORY_SYMBOLS.map((symbol) => findQuote(activePulse, symbol)).filter(Boolean);
  const opticalQuotes = OPTICAL_SYMBOLS.map((symbol) => findQuote(activePulse, symbol)).filter(Boolean);
  const tableQuotes = [...(activePulse?.quotes || [])].sort((a, b) => {
    const aCore = CORE_SYMBOLS.includes(a.symbol) ? CORE_SYMBOLS.indexOf(a.symbol) : 99;
    const bCore = CORE_SYMBOLS.includes(b.symbol) ? CORE_SYMBOLS.indexOf(b.symbol) : 99;
    return aCore - bCore || displaySymbol(a.symbol).localeCompare(displaySymbol(b.symbol));
  });
  const pressureTone = activePulse?.pressureTone || "calm";
  const pressureColor = PRESSURE_COLORS[pressureTone] || PRESSURE_COLORS.calm;
  const latest = anchor.latest;

  return (
    <div className="app-shell pulse-shell">
      <header className="pulse-topbar">
        <div>
          <a className="pulse-back" href="/">
            周度地图
          </a>
          <p className="kicker">RegimeAlpha / Intraday Pulse</p>
          <h1>盘中敏感预警</h1>
        </div>
        <div className="pulse-freshness">
          <span>{activePulse?.marketSession?.label || "等待盘中数据"}</span>
          <strong>{activePulse ? formatTime(activePulse.generatedAt) : "--:--"}</strong>
          <em>{loading ? "刷新中" : error ? "数据延迟" : `自动刷新 ${secondsLeft}s`}</em>
        </div>
      </header>

      <main className="pulse-grid">
        <section className="pulse-hero" style={{ "--pressure": pressureColor, "--regime": REGIME_COLORS[latest.code] }}>
          <div className="pulse-anchor">
            <span>当前周度 Regime</span>
            <h2>{latest.labelZh}</h2>
            <p>{latest.thesis}</p>
            <div className="pulse-anchor-metrics">
              <Metric label="数据截至" value={anchor.metadata.dataThrough} />
              <Metric label="SPY 13W" value={formatPercent(latest.metrics.ret13w)} tone={latest.metrics.ret13w >= 0 ? "good" : "bad"} />
              <Metric label="VIX" value={number(latest.metrics.vixClose, 1)} />
            </div>
          </div>

          <div className="pressure-panel">
            <div className="pressure-title">
              <span>
                Regime Pressure
                <Hint tip={PULSE_HINTS.pressure} />
              </span>
              <strong>{activePulse?.pressureLabel || "等待数据"}</strong>
            </div>
            <div className="pressure-score">
              <b>{activePulse?.pressureScore ?? "--"}</b>
              <span>/100</span>
            </div>
            <div className="pressure-track" aria-label="Regime pressure score">
              <i style={{ width: `${Math.min(100, activePulse?.pressureScore || 0)}%` }} />
            </div>
            <p>{activePulse?.signals?.summary || "正在等待 /api/pulse 返回盘中行情。"}</p>
          </div>
        </section>

        {error ? (
          <div className="pulse-stale" role="status">
            <strong>盘中数据暂时延迟</strong>
            <span>{error}</span>
            {lastGood ? <em>保留上次成功快照：{formatTime(lastGood.generatedAt)}</em> : null}
          </div>
        ) : null}

        <section className="memory-panel">
          <PanelTitle title="存储链条实时" meta={`${memoryQuotes.length} names · DRAM / MU / SNDK / SK hynix / Samsung / WDC / STX`} />
          <div className="memory-grid">
            {memoryQuotes.map((quote) => (
              <MemoryCard key={quote.symbol} quote={quote} chart={activePulse?.charts?.[quote.symbol]} flash={flashMap[quote.symbol]} />
            ))}
          </div>
          <p className="memory-note">
            时段标签按交易所本地时间显示：美股支持盘前、盘中、盘后；韩股使用 KRX 本地盘中/休市状态。
          </p>
        </section>

        <section className="memory-panel optical-panel">
          <PanelTitle title="光通信链条实时" meta={`${opticalQuotes.length} names · AAOI / LITE / COHR / CIEN / FN / MTSI / CRDO / MRVL`} />
          <div className="optical-grid">
            {opticalQuotes.map((quote) => (
              <MemoryCard key={quote.symbol} quote={quote} chart={activePulse?.charts?.[quote.symbol]} flash={flashMap[quote.symbol]} />
            ))}
          </div>
          <p className="memory-note">
            核心光模块/光器件优先展示 AAOI、LITE、COHR；CIEN、FN、MTSI、CRDO、MRVL 是设备、制造和高速互连扩展；AVGO、NOK、CSCO、SMTC 标记为间接暴露。
          </p>
        </section>

        <section className="pulse-cards" aria-label="Core intraday radar">
          {coreQuotes.map((quote) => (
            <QuoteCard
              key={quote.symbol}
              quote={quote}
              chart={activePulse?.charts?.[quote.symbol]}
              flash={flashMap[quote.symbol]}
              weeklyAsset={latestAssetMap.get(quote.symbol)}
            />
          ))}
        </section>

        <section className="pulse-alerts">
          <PanelTitle title="盘中事件流" meta={`${activePulse?.alerts?.length || 0} alerts`} />
          <div className="alert-list">
            {(activePulse?.alerts || []).length ? (
              activePulse.alerts.map((alert) => (
                <article className={`alert-item ${alert.severity}`} key={alert.type}>
                  <span>{alert.label}</span>
                  <strong>{alert.reason}</strong>
                  <em>{alert.impact}</em>
                </article>
              ))
            ) : (
              <article className="alert-item quiet">
                <span>No trigger</span>
                <strong>盘中信号暂未挑战周度 regime。</strong>
                <em>等待下一次刷新</em>
              </article>
            )}
          </div>
        </section>

        <section className="pulse-table-panel">
          <PanelTitle title="跟踪标的" meta={`${tableQuotes.length} symbols`} />
          <div className="pulse-table-wrap">
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Day</th>
                  <th>Rel SPY</th>
                  <th>Volume</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {tableQuotes.map((quote) => (
                  <tr key={quote.symbol}>
                    <td>
                      <strong>{displaySymbol(quote.symbol)}</strong>
                      <span>{quote.name}</span>
                    </td>
                    <td>{money(quote.price)}</td>
                    <td className={quote.changePercent >= 0 ? "good" : "bad"}>{formatPercent(quote.changePercent)}</td>
                    <td className={(quote.relativeToSpy || 0) >= 0 ? "good" : "bad"}>{quote.symbol === "SPY" ? "-" : formatPercent(quote.relativeToSpy)}</td>
                    <td>{compact(quote.volume)}</td>
                    <td>
                      <span className={`signal-tag ${quote.signalTone}`}>{quote.signalTag}</span>
                      <span className={`session-chip ${quote.session?.state || "closed"}`}>{quote.session?.label || "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function QuoteCard({ quote, chart, flash, weeklyAsset }) {
  const tone = quote.changePercent >= 0 ? "good" : "bad";
  return (
    <article className={`quote-card ${flash || ""}`}>
      <div className="quote-head">
        <div>
          <span>{displaySymbol(quote)}</span>
          <strong>{quote.name}</strong>
        </div>
        <em className={quote.signalTone}>{quote.signalTag}</em>
      </div>
      <div className="quote-price">
        <strong>{money(quote.price)}</strong>
        <span className={tone}>{formatPercent(quote.changePercent)}</span>
      </div>
      <Sparkline points={chart?.sparkline || []} tone={tone} />
      <div className="quote-foot">
        <span>
          Rel SPY {quote.symbol === "SPY" ? "-" : formatPercent(quote.relativeToSpy)}
          <Hint tip={PULSE_HINTS.relative} />
        </span>
        <span>Range {formatPercent(chart?.range)}</span>
        <span className={`session-chip ${quote.session?.state || "closed"}`}>
          {quote.session?.venue || quote.exchange || ""} {quote.session?.label || "-"}
          <Hint tip={PULSE_HINTS.session} />
        </span>
        {weeklyAsset ? <span>{weeklyAsset.labelZh}</span> : null}
      </div>
    </article>
  );
}

function MemoryCard({ quote, chart, flash }) {
  const tone = quote.changePercent >= 0 ? "good" : "bad";
  return (
    <article className={`memory-card ${flash || ""}`}>
      <div className="memory-card-top">
        <div>
          <span>{displaySymbol(quote)}</span>
          <strong>{quote.alias || quote.name}</strong>
        </div>
        <em className={`session-chip ${quote.session?.state || "closed"}`}>
          {quote.session?.label || "-"}
          <Hint tip={PULSE_HINTS.session} />
        </em>
      </div>
      <div className="memory-price">
        <strong>{money(quote.price)}</strong>
        <span className={tone}>{formatPercent(quote.changePercent)}</span>
      </div>
      <Sparkline points={chart?.sparkline || []} tone={tone} />
      <div className="memory-meta">
        <span>{quote.theme || quote.group || quote.exchange}</span>
        <span>{quote.exchange || quote.session?.venue}</span>
        <span className={quote.relativeToSpy >= 0 ? "good" : "bad"}>Rel SPY {formatPercent(quote.relativeToSpy)}</span>
      </div>
    </article>
  );
}

function Sparkline({ points, tone }) {
  const width = 220;
  const height = 54;
  if (!points.length) {
    return <div className="sparkline empty" aria-hidden="true" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point - min) / Math.max(0.0001, max - min)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={`sparkline ${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="intraday sparkline">
      <path d={path} />
    </svg>
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

function Metric({ label, value, tone }) {
  return (
    <div className={`pulse-metric ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function Hint({ tip }) {
  if (!tip) return null;
  return (
    <span className="pulse-hint" tabIndex={0} aria-label={tip.title}>
      ?
      <span className="pulse-hint-popover" role="tooltip">
        <b>{tip.title}</b>
        <span>{tip.body}</span>
      </span>
    </span>
  );
}

function useCountdown(target, limit = 60) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!target) return limit;
  return Math.max(0, Math.min(limit, Math.ceil((target - now) / 1000)));
}

function findQuote(pulse, symbol) {
  return pulse?.quotes?.find((quote) => quote.symbol === symbol);
}

function displaySymbol(quoteOrSymbol) {
  const symbol = typeof quoteOrSymbol === "string" ? quoteOrSymbol : quoteOrSymbol.symbol;
  return typeof quoteOrSymbol === "object" && quoteOrSymbol.displaySymbol
    ? quoteOrSymbol.displaySymbol
    : DISPLAY_SYMBOLS[symbol] || symbol;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function money(value) {
  if (!Number.isFinite(value)) return "-";
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value.toFixed(2);
}

function compact(value) {
  if (!Number.isFinite(value)) return "-";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}
