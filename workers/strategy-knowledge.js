export const SUPPORTED_REGIMES = [
  "bull_quiet",
  "bull_volatile",
  "bear_quiet",
  "bear_volatile",
  "sideways_quiet",
  "sideways_volatile",
  "trend_accelerating",
  "mean_reverting",
  "stagflationary",
  "microstructure_dislocation"
];

export const SUPPORTED_INSTRUMENTS = [
  "long_equity",
  "etf",
  "letf",
  "options",
  "otm_options",
  "spreads",
  "hedge",
  "cash"
];

export const CORE_PRINCIPLES = [
  "Regime is a precondition for strategy selection; the same instrument can have opposite risk/reward in different regimes.",
  "The TVTP framing cares about persistence and transition probabilities, not only the current regime label.",
  "Strategy selection should jointly consider direction, realized/implied volatility, correlation, positioning/crowding, and microstructure.",
  "Sideways/high-volatility regimes are structurally hostile to leverage, LETFs, and naked long OTM options because variance drain, theta decay, and vol crush can overwhelm direction.",
  "Trend-accelerating regimes can reward momentum and thematic rotation, but require monitoring for crowding, gamma/CTA triggers, and trend-efficiency decay.",
  "Bull-quiet regimes tend to favor diversified long exposure and cross-sectional alpha; protection can be inefficient when option premium is expensive relative to realized risk.",
  "Outputs must separate current data observations, article-derived principles, and user-holding inferences."
];

export const GUARDRAILS = {
  notInvestmentAdvice: true,
  scope: "research_framework",
  allowedLanguage: ["risk mapping", "scenario analysis", "inputs to verify", "possible structures to evaluate"],
  disallowedLanguage: ["direct buy/sell instructions", "position sizing commands", "guaranteed outcomes"],
  requiresUserInputsForSpecificity: [
    "position size",
    "cost basis",
    "expiry",
    "strike",
    "implied volatility or IV rank",
    "portfolio concentration"
  ]
};

const allInstruments = SUPPORTED_INSTRUMENTS;

export const STRATEGY_ENTRIES = [
  {
    id: "bull_quiet_alpha_compounding",
    title: "Bull Quiet: diversified compounding and stock selection",
    source: "direct_pdf",
    appliesTo: { regimes: ["bull_quiet"], instruments: ["long_equity", "etf", "cash"] },
    risks: ["vol_crush"],
    principle: "Low realized volatility, falling correlation, and positive drift favor diversified long exposure and cross-sectional alpha.",
    useWhen: ["13W return is positive", "VIX and realized volatility are subdued", "sector correlation is falling"],
    avoidWhen: ["option premium is high relative to realized volatility", "crowding and upside chase dominate fundamentals"],
    watch: ["VIX moving above quiet thresholds", "correlation rising", "sector leadership narrowing"]
  },
  {
    id: "bull_volatile_late_cycle_control",
    title: "Bull Volatile: trend participation with convexity controls",
    source: "direct_pdf",
    appliesTo: { regimes: ["bull_volatile"], instruments: ["etf", "options", "spreads", "hedge"] },
    risks: ["short_gamma", "whipsaw"],
    principle: "Upward drift exists, but volatility and herding can turn pullbacks into violent deleveraging episodes.",
    useWhen: ["uptrend remains intact", "volatility is expanding with price", "leadership is crowded but still persistent"],
    avoidWhen: ["naked short gamma", "high leverage without exit criteria", "ignoring gap risk"],
    watch: ["VIX spikes", "dealer gamma flips", "CTA positioning stress"]
  },
  {
    id: "bear_quiet_defensive_decay",
    title: "Bear Quiet: slow deterioration and defensive carry",
    source: "derived_from_pdf",
    appliesTo: { regimes: ["bear_quiet"], instruments: ["cash", "hedge", "spreads", "etf"] },
    risks: ["theta_decay", "whipsaw"],
    principle: "Orderly downward drift can punish premature bottom-fishing while making expensive crash hedges decay.",
    useWhen: ["trend is below long smoothing averages", "volatility is not yet panic-like", "fundamental deterioration is slow"],
    avoidWhen: ["high beta long exposure", "long OTM convexity with no catalyst", "assuming low VIX means low downside risk"],
    watch: ["VIX acceleration", "credit or macro deterioration", "drawdown persistence"]
  },
  {
    id: "bear_volatile_tail_and_liquidity",
    title: "Bear Volatile: liquidity, convexity, and correlation stress",
    source: "direct_pdf",
    appliesTo: { regimes: ["bear_volatile"], instruments: ["hedge", "options", "spreads", "cash"] },
    risks: ["short_gamma", "correlation_spike", "liquidity_gap", "cta_deleveraging"],
    principle: "Correlation approaches one, liquidity weakens, and short-gamma/CTA flows can dominate fundamentals.",
    useWhen: ["VIX and realized volatility spike", "correlations rise sharply", "gap risk is elevated"],
    avoidWhen: ["naked short options", "illiquid leverage", "assuming diversification is intact"],
    watch: ["cross-asset correlation", "bid-ask widening", "systematic deleveraging triggers"]
  },
  {
    id: "sideways_quiet_vrp_rotation",
    title: "Sideways Quiet: range, carry, and rotation",
    source: "direct_pdf",
    appliesTo: { regimes: ["sideways_quiet"], instruments: ["spreads", "options", "etf", "cash"] },
    risks: ["theta_decay", "whipsaw"],
    principle: "Low volatility and weak direction favor range-aware structures and sector rotation over breakout chasing.",
    useWhen: ["realized volatility is compressed", "price is range-bound", "leadership rotates without index trend"],
    avoidWhen: ["paying for OTM gamma without catalyst", "high leverage trend following", "ignoring support/resistance context"],
    watch: ["vol compression", "autocorrelation turning positive", "range expansion"]
  },
  {
    id: "sideways_volatile_variance_drain",
    title: "Sideways Volatile: variance drain and option-buyer friction",
    source: "direct_pdf",
    appliesTo: { regimes: ["sideways_volatile"], instruments: ["spreads", "hedge", "cash", "options", "otm_options", "letf"] },
    risks: ["variance_drain", "vol_crush", "theta_decay", "whipsaw"],
    principle: "High-magnitude whipsaws with little net progress are structurally destructive to LETFs and naked long OTM options.",
    useWhen: ["range is wide", "realized volatility is elevated", "directional confidence is low"],
    avoidWhen: ["unhedged LETF exposure", "all-premium OTM option bets", "trend systems without filters"],
    watch: ["realized versus implied volatility", "failed breakouts", "sector leadership reversals"]
  },
  {
    id: "trend_accelerating_momentum_convexity",
    title: "Trend Accelerating: momentum, compounding, and crowding checks",
    source: "direct_pdf",
    appliesTo: { regimes: ["trend_accelerating"], instruments: ["long_equity", "etf", "letf", "options", "otm_options", "spreads"] },
    risks: ["cta_deleveraging", "short_gamma", "vol_crush"],
    principle: "Positive serial autocorrelation can make trend following and leveraged compounding work, but transition risk rises as crowding builds.",
    useWhen: ["trend efficiency improves", "4W and 13W returns align", "relative strength is broadening"],
    avoidWhen: ["mechanically extrapolating after trend exhaustion", "ignoring gamma/CTA trigger levels", "late chase with no invalidation"],
    watch: ["trend-efficiency decay", "VIX divergence", "crowding and positioning percentiles"]
  },
  {
    id: "mean_reverting_exhaustion_reset",
    title: "Mean Reverting: exhaustion and snapback discipline",
    source: "direct_pdf",
    appliesTo: { regimes: ["mean_reverting"], instruments: ["spreads", "options", "hedge", "cash"] },
    risks: ["whipsaw", "vol_crush", "theta_decay"],
    principle: "Terminal moves can snap back violently; structures should respect reversal speed and post-shock volatility normalization.",
    useWhen: ["prior trend is exhausted", "autocorrelation flips", "volatility is compressing after a spike"],
    avoidWhen: ["chasing the stale trend", "overpaying for late gamma", "assuming reversal means durable new trend"],
    watch: ["reversal rate", "autocorrelation", "drawdown recovery"]
  },
  {
    id: "stagflationary_correlation_break",
    title: "Stagflationary: equity-bond correlation break",
    source: "direct_pdf",
    appliesTo: { regimes: ["stagflationary"], instruments: ["cash", "hedge", "spreads", "etf"] },
    risks: ["correlation_spike", "liquidity_gap"],
    principle: "Positive stock-bond correlation weakens traditional diversification and raises the value of explicit stress testing.",
    useWhen: ["equity and bond drawdowns align", "rates pressure duration assets", "macro inflation uncertainty persists"],
    avoidWhen: ["assuming 60/40 protection", "duration-heavy hedges without regime check", "unexamined beta concentration"],
    watch: ["SPY/TLT correlation", "yield shocks", "VIX and rate-vol co-movement"]
  },
  {
    id: "microstructure_execution_first",
    title: "Microstructure Dislocation: execution and liquidity first",
    source: "direct_pdf",
    appliesTo: { regimes: ["microstructure_dislocation"], instruments: ["cash", "hedge", "options", "spreads"] },
    risks: ["liquidity_gap", "short_gamma", "correlation_spike"],
    principle: "Pricing models and historical correlations can fail during transient liquidity breaks; execution risk becomes primary.",
    useWhen: ["gaps, spread widening, or flash-crash behavior appear", "news shock meets crowded positioning", "market depth disappears"],
    avoidWhen: ["market orders in illiquid structures", "short gamma without controls", "assuming model marks are executable"],
    watch: ["bid-ask spreads", "max daily move", "open gaps", "volume breaks"]
  }
];

export const INSTRUMENT_GUIDANCE = [
  {
    instrument: "long_equity",
    title: "股票多头",
    source: "derived_from_pdf",
    fit: "best",
    regimes: ["bull_quiet", "trend_accelerating", "sideways_quiet"],
    risks: ["whipsaw", "correlation_spike"],
    preferredStructures: ["fundamental stock selection", "relative-strength baskets"],
    avoidConditions: ["bear_volatile", "microstructure_dislocation"],
    missingInputs: ["position size", "cost basis", "portfolio concentration"]
  },
  {
    instrument: "etf",
    title: "ETF",
    source: "derived_from_pdf",
    fit: "best",
    regimes: ["bull_quiet", "sideways_quiet", "trend_accelerating", "stagflationary"],
    risks: ["correlation_spike", "whipsaw"],
    preferredStructures: ["broad beta", "sector rotation", "risk-balanced sleeves"],
    avoidConditions: ["hidden concentration", "correlation shock"],
    missingInputs: ["position size", "cost basis"]
  },
  {
    instrument: "letf",
    title: "LETF",
    source: "direct_pdf",
    fit: "best",
    regimes: ["trend_accelerating", "bull_quiet"],
    risks: ["variance_drain", "whipsaw", "cta_deleveraging"],
    preferredStructures: ["short holding period trend following", "strict volatility filter"],
    avoidConditions: ["sideways_volatile", "bear_volatile", "microstructure_dislocation"],
    missingInputs: ["holding period", "position size", "volatility threshold"]
  },
  {
    instrument: "options",
    title: "期权",
    source: "direct_pdf",
    fit: "best",
    regimes: ["bear_volatile", "mean_reverting", "sideways_quiet", "bull_volatile"],
    risks: ["theta_decay", "vol_crush", "short_gamma"],
    preferredStructures: ["defined-risk spreads", "tail hedges", "VRP-aware structures"],
    avoidConditions: ["unpriced gap risk", "short gamma into dislocation"],
    missingInputs: ["expiry", "strike", "implied volatility or IV rank", "position size"]
  },
  {
    instrument: "otm_options",
    title: "OTM 期权",
    source: "direct_pdf",
    fit: "avoid",
    regimes: ["sideways_volatile", "bear_quiet", "sideways_quiet", "trend_accelerating"],
    risks: ["theta_decay", "vol_crush", "whipsaw"],
    preferredStructures: ["catalyst-linked convexity", "spread-defined premium", "scenario sizing"],
    avoidConditions: ["no catalyst", "elevated IV with weak trend", "long-dated thesis without volatility plan"],
    missingInputs: ["expiry", "strike", "moneyness", "implied volatility or IV rank", "cost basis"]
  },
  {
    instrument: "spreads",
    title: "价差",
    source: "derived_from_pdf",
    fit: "best",
    regimes: ["sideways_quiet", "sideways_volatile", "mean_reverting", "bear_quiet"],
    risks: ["short_gamma", "theta_decay", "liquidity_gap"],
    preferredStructures: ["defined-risk debit/credit spreads", "calendar-aware structures"],
    avoidConditions: ["illiquid strikes", "gap-heavy microstructure stress"],
    missingInputs: ["expiry", "strikes", "implied volatility or IV rank"]
  },
  {
    instrument: "hedge",
    title: "对冲",
    source: "direct_pdf",
    fit: "best",
    regimes: ["bear_volatile", "stagflationary", "microstructure_dislocation", "bull_volatile"],
    risks: ["theta_decay", "correlation_spike", "liquidity_gap"],
    preferredStructures: ["tail-risk hedge", "beta hedge", "duration/correlation hedge review"],
    avoidConditions: ["overpaying for stale protection", "hedge mismatch"],
    missingInputs: ["hedge relationship", "portfolio concentration", "position size"]
  },
  {
    instrument: "cash",
    title: "现金",
    source: "derived_from_pdf",
    fit: "best",
    regimes: ["bear_volatile", "sideways_volatile", "stagflationary", "microstructure_dislocation", "bear_quiet"],
    risks: ["opportunity_cost"],
    preferredStructures: ["dry powder", "volatility buffer", "liquidity reserve"],
    avoidConditions: ["using cash as a substitute for thesis clarity"],
    missingInputs: ["target allocation", "opportunity set"]
  }
];

export const RISK_RULES = [
  {
    id: "variance_drain",
    title: "Variance drain",
    source: "direct_pdf",
    mostRelevantRegimes: ["sideways_volatile", "bear_volatile"],
    mostRelevantInstruments: ["letf", "otm_options", "options"],
    explanation: "High volatility without directional persistence mechanically erodes leveraged and path-dependent structures."
  },
  {
    id: "vol_crush",
    title: "Vol crush",
    source: "derived_from_pdf",
    mostRelevantRegimes: ["mean_reverting", "sideways_volatile", "bull_quiet", "trend_accelerating"],
    mostRelevantInstruments: ["options", "otm_options", "spreads"],
    explanation: "A correct direction can still lose if implied volatility falls faster than intrinsic value grows."
  },
  {
    id: "theta_decay",
    title: "Theta decay",
    source: "direct_pdf",
    mostRelevantRegimes: ["sideways_quiet", "sideways_volatile", "bear_quiet", "mean_reverting"],
    mostRelevantInstruments: ["options", "otm_options", "spreads", "hedge"],
    explanation: "Time decay is most visible when price fails to move far enough or quickly enough."
  },
  {
    id: "short_gamma",
    title: "Short gamma",
    source: "direct_pdf",
    mostRelevantRegimes: ["bear_volatile", "microstructure_dislocation", "bull_volatile"],
    mostRelevantInstruments: ["options", "spreads", "hedge"],
    explanation: "Short gamma exposures can force selling into declines and buying into spikes, accelerating moves."
  },
  {
    id: "cta_deleveraging",
    title: "CTA deleveraging",
    source: "direct_pdf",
    mostRelevantRegimes: ["trend_accelerating", "bear_volatile", "bull_volatile"],
    mostRelevantInstruments: ["letf", "etf", "long_equity", "options"],
    explanation: "Crowded systematic positioning can flip from trend support to forced liquidation around trigger levels."
  },
  {
    id: "correlation_spike",
    title: "Correlation spike",
    source: "direct_pdf",
    mostRelevantRegimes: ["bear_volatile", "stagflationary", "microstructure_dislocation"],
    mostRelevantInstruments: ["etf", "long_equity", "hedge", "cash"],
    explanation: "Diversification weakens when assets move together under stress."
  },
  {
    id: "whipsaw",
    title: "Whipsaw",
    source: "derived_from_pdf",
    mostRelevantRegimes: ["sideways_volatile", "sideways_quiet", "mean_reverting", "bull_volatile"],
    mostRelevantInstruments: allInstruments,
    explanation: "Rapid reversals punish trend extrapolation and poorly timed option entries."
  },
  {
    id: "liquidity_gap",
    title: "Liquidity gap",
    source: "direct_pdf",
    mostRelevantRegimes: ["microstructure_dislocation", "bear_volatile", "stagflationary"],
    mostRelevantInstruments: ["options", "spreads", "hedge", "letf"],
    explanation: "Execution prices can detach from model marks when spreads widen and depth disappears."
  }
];

export const TRANSITION_SIGNALS = [
  {
    id: "quiet_bull_persistence",
    source: "derived_from_pdf",
    fromRegimes: ["bull_quiet"],
    toRegimes: ["bull_quiet", "trend_accelerating"],
    indicators: ["13W return", "VIX", "realized volatility", "sector correlation"],
    interpretation: "Positive drift plus quiet volatility supports persistence until correlation or VIX rises."
  },
  {
    id: "quiet_bull_to_volatile_bull",
    source: "derived_from_pdf",
    fromRegimes: ["bull_quiet"],
    toRegimes: ["bull_volatile"],
    indicators: ["VIX", "weekly range", "crowding", "sector herding"],
    interpretation: "Upside continuation with expanding volatility can signal late-cycle speculative behavior."
  },
  {
    id: "chop_to_trend_acceleration",
    source: "direct_pdf",
    fromRegimes: ["sideways_quiet", "sideways_volatile"],
    toRegimes: ["trend_accelerating"],
    indicators: ["trend efficiency", "serial autocorrelation", "relative strength", "volume"],
    interpretation: "A range can transition into momentum when serial autocorrelation and relative strength improve together."
  },
  {
    id: "trend_acceleration_to_mean_reversion",
    source: "direct_pdf",
    fromRegimes: ["trend_accelerating"],
    toRegimes: ["mean_reverting"],
    indicators: ["trend efficiency decay", "autocorrelation flip", "VIX divergence", "reversal rate"],
    interpretation: "Crowded trends become vulnerable when efficiency fades and reversal behavior rises."
  },
  {
    id: "high_corr_vix_to_bear_volatile",
    source: "direct_pdf",
    fromRegimes: ["bull_volatile", "sideways_volatile", "bear_quiet"],
    toRegimes: ["bear_volatile"],
    indicators: ["VIX spike", "correlation spike", "CTA triggers", "dealer gamma"],
    interpretation: "Stress becomes systemic when volatility, correlation, and forced-flow indicators align."
  },
  {
    id: "equity_bond_stress_to_stagflationary",
    source: "direct_pdf",
    fromRegimes: ["bull_quiet", "sideways_volatile", "bear_quiet"],
    toRegimes: ["stagflationary"],
    indicators: ["SPY/TLT correlation", "yield shocks", "inflation pressure", "joint drawdown"],
    interpretation: "Equity-bond correlation turning positive weakens traditional portfolio protection."
  },
  {
    id: "shock_to_microstructure_dislocation",
    source: "direct_pdf",
    fromRegimes: SUPPORTED_REGIMES,
    toRegimes: ["microstructure_dislocation"],
    indicators: ["open gap", "max daily move", "bid-ask spread", "negative headline shock"],
    interpretation: "A catalyst hitting crowded positioning can make execution and liquidity dominate regime labels."
  }
];

export function normalizeRegime(regime) {
  return String(regime || "").trim().toLowerCase();
}

export function normalizeInstrument(instrument) {
  return String(instrument || "").trim().toLowerCase();
}

export function filterStrategyEntries({ regime, instrument, risk, query } = {}) {
  const normalizedRegime = normalizeRegime(regime);
  const normalizedInstrument = normalizeInstrument(instrument);
  const normalizedRisk = String(risk || "").trim().toLowerCase();
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);

  return STRATEGY_ENTRIES.filter((entry) => {
    if (normalizedRegime && !entry.appliesTo.regimes.includes(normalizedRegime)) return false;
    if (normalizedInstrument && !entry.appliesTo.instruments.includes(normalizedInstrument)) return false;
    if (normalizedRisk && !entry.risks.includes(normalizedRisk)) return false;
    if (terms.length) {
      const haystack = [
        entry.id,
        entry.title,
        entry.principle,
        ...(entry.useWhen || []),
        ...(entry.avoidWhen || []),
        ...(entry.watch || []),
        ...(entry.risks || [])
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }
    return true;
  });
}

export function filterRiskRules({ regime, instrument, risk } = {}) {
  const normalizedRegime = normalizeRegime(regime);
  const normalizedInstrument = normalizeInstrument(instrument);
  const normalizedRisk = String(risk || "").trim().toLowerCase();
  return RISK_RULES.filter((rule) => {
    if (normalizedRisk && rule.id !== normalizedRisk) return false;
    if (normalizedRegime && !rule.mostRelevantRegimes.includes(normalizedRegime)) return false;
    if (normalizedInstrument && !rule.mostRelevantInstruments.includes(normalizedInstrument)) return false;
    return true;
  });
}

export function filterTransitionSignals({ regime } = {}) {
  const normalizedRegime = normalizeRegime(regime);
  if (!normalizedRegime) return TRANSITION_SIGNALS;
  return TRANSITION_SIGNALS.filter(
    (signal) => signal.fromRegimes.includes(normalizedRegime) || signal.toRegimes.includes(normalizedRegime)
  );
}

export function getInstrumentGuidance(instrument, regime) {
  const normalizedInstrument = normalizeInstrument(instrument);
  const normalizedRegime = normalizeRegime(regime);
  return INSTRUMENT_GUIDANCE.filter((entry) => {
    if (entry.instrument !== normalizedInstrument) return false;
    if (normalizedRegime && entry.regimes?.length && !entry.regimes.includes(normalizedRegime)) return false;
    return true;
  });
}

export function getRegimeInstrumentFit(regime) {
  const normalizedRegime = normalizeRegime(regime);
  const guidance = INSTRUMENT_GUIDANCE.filter((entry) => entry.regimes?.includes(normalizedRegime));
  const bestFitInstruments = guidance.filter((entry) => entry.fit !== "avoid");
  const avoidInstruments = guidance.filter(
    (entry) =>
      entry.fit === "avoid" ||
      (entry.avoidConditions || []).includes(normalizedRegime) ||
      (normalizedRegime === "sideways_volatile" && ["letf", "otm_options"].includes(entry.instrument))
  );
  return { bestFitInstruments, avoidInstruments };
}
