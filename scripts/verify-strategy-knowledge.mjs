import {
  CORE_PRINCIPLES,
  GUARDRAILS,
  INSTRUMENT_GUIDANCE,
  RISK_RULES,
  STRATEGY_ENTRIES,
  TRANSITION_SIGNALS,
  SUPPORTED_INSTRUMENTS,
  SUPPORTED_REGIMES
} from "../workers/strategy-knowledge.js";
import {
  getArticlePage,
  getRelevantArticleContext,
  listArticleChunks
} from "../workers/article-context-utils.js";

const requiredRisks = [
  "variance_drain",
  "vol_crush",
  "theta_decay",
  "short_gamma",
  "cta_deleveraging",
  "correlation_spike",
  "whipsaw",
  "liquidity_gap"
];

const requiredTransitionFamilies = [
  "quiet_bull_persistence",
  "quiet_bull_to_volatile_bull",
  "chop_to_trend_acceleration",
  "trend_acceleration_to_mean_reversion",
  "high_corr_vix_to_bear_volatile",
  "equity_bond_stress_to_stagflationary",
  "shock_to_microstructure_dislocation"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const regime of SUPPORTED_REGIMES) {
  assert(
    STRATEGY_ENTRIES.some((entry) => entry.appliesTo.regimes.includes(regime)),
    `Missing strategy entry for regime ${regime}`
  );
}

for (const instrument of SUPPORTED_INSTRUMENTS) {
  assert(
    INSTRUMENT_GUIDANCE.some((entry) => entry.instrument === instrument),
    `Missing instrument guidance for ${instrument}`
  );
}

for (const risk of requiredRisks) {
  assert(RISK_RULES.some((rule) => rule.id === risk), `Missing risk rule ${risk}`);
}

for (const family of requiredTransitionFamilies) {
  assert(TRANSITION_SIGNALS.some((signal) => signal.id === family), `Missing transition signal ${family}`);
}

assert(CORE_PRINCIPLES.length >= 7, "Expected at least seven core principles");
assert(GUARDRAILS.notInvestmentAdvice === true, "Guardrails must mark notInvestmentAdvice");
assert(GUARDRAILS.scope === "research_framework", "Guardrails must use research_framework scope");
assert(GUARDRAILS.disallowedLanguage.includes("direct buy/sell instructions"), "Guardrails must block direct trading instructions");

const chunks = listArticleChunks();
assert(chunks.length > 10, "Expected article chunks");
assert(chunks[0].id === "article-chunk-001", "Expected stable first chunk id");

const firstPage = getArticlePage({ articleLimit: 5 });
assert(firstPage.chunks.length === 5, "Expected first article page limit");
assert(firstPage.cursor === "5", "Expected cursor offset 5");
assert(firstPage.hasMore === true, "Expected first page to have more chunks");

const relevant = getRelevantArticleContext({
  query: "options volatility sideways",
  riskTags: ["theta_decay", "vol_crush"],
  articleLimit: 3
});
assert(relevant.chunks.length > 0, "Expected relevant article chunks");
assert(relevant.mode === "relevant_chunks", "Expected relevant chunk mode");

console.log("strategy knowledge coverage ok");
