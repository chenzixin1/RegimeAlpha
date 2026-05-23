# Strategy Knowledge MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF-derived strategy knowledge tools to RegimeAlpha MCP and show MCP/API usage instructions on the website.

**Architecture:** Split the Worker into shared data utilities, article context helpers, a curated strategy knowledge module, and a strategy-tool registration module. Keep existing regime-data MCP tools intact, then register new strategy/article tools in the same stateless Cloudflare Worker. Add a compact website section that tells other agents how to use the JSON API and MCP endpoint.

**Tech Stack:** Next.js App Router, Cloudflare Pages Functions, Cloudflare Workers, Cloudflare Agents SDK `createMcpHandler`, `@modelcontextprotocol/sdk`, `zod`, Node verification scripts.

---

## Spec Reference

Implement against:

- `docs/superpowers/specs/2026-05-24-strategy-knowledge-mcp-design.md`

Important spec points:

- First version must cover all 10 current regimes and all 8 supported instrument families.
- Strategy tools must always include `corePrinciples` and `guardrails`.
- Article context modes:
  - `none`
  - `relevant_chunks`
  - `full_article` only on `get_strategy_playbook`; full article also available through `get_article_chunks`.
- Pagination uses `articleLimit`, default `5`, max `12`, cursor as decimal string offset.
- `map_position_to_regime_risks` must support `defaultRegime` and per-position `regime`.
- No direct buy/sell/add/close instructions.

## File Structure

- Create `workers/regime-data-utils.js`
  - Shared live-data loading, symbol normalization, compact row formatting, JSON MCP result helpers.
  - Move equivalent helper logic out of `workers/regime-mcp.js`.

- Create `workers/article-context-utils.js`
  - Imports `ARTICLE_CHUNKS`, `ARTICLE_TITLE`, `ARTICLE_PDF_PATH`.
  - Adds stable chunk ids without modifying generated article data.
  - Provides search and pagination helpers.

- Create `workers/strategy-knowledge.js`
  - Static curated strategy knowledge.
  - Exports `CORE_PRINCIPLES`, `GUARDRAILS`, `STRATEGY_ENTRIES`, `INSTRUMENT_GUIDANCE`, `RISK_RULES`, `TRANSITION_SIGNALS`.
  - Exports filter helpers and validation constants.

- Create `workers/strategy-tools.js`
  - Registers new MCP tools:
    - `get_strategy_playbook`
    - `get_regime_strategy`
    - `get_instrument_guidance`
    - `map_position_to_regime_risks`
    - `search_article_context`
    - `get_article_chunks`

- Modify `workers/regime-mcp.js`
  - Import shared utilities.
  - Preserve existing four data tools.
  - Register strategy tools.

- Modify `app/components/RegimeDashboard.jsx`
  - Add website instructions section for JSON API and MCP usage.
  - Keep it compact and implementation-focused, not marketing copy.

- Modify `app/globals.css`
  - Style the MCP/API usage section with existing panel aesthetics.

- Modify `README.md`
  - Add strategy MCP tool list and examples.

- Create `scripts/verify-strategy-knowledge.mjs`
  - Static validation for strategy coverage, article pagination, and filter behavior.

- Create `scripts/verify-mcp-strategy.mjs`
  - MCP SDK verification against a configurable endpoint.

- Modify `package.json`
  - Add scripts:
    - `verify:strategy-knowledge`
    - `verify:mcp-strategy`

---

## Task 1: Add Static Strategy Knowledge Validation

**Files:**
- Create: `workers/strategy-knowledge.js`
- Create: `scripts/verify-strategy-knowledge.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing validation script**

Create `scripts/verify-strategy-knowledge.mjs` with this initial behavior:

```js
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

console.log("strategy knowledge coverage ok");
```

- [ ] **Step 2: Add package script**

Modify `package.json`:

```json
"verify:strategy-knowledge": "node scripts/verify-strategy-knowledge.mjs"
```

- [ ] **Step 3: Run validation and verify it fails**

Run:

```bash
npm run verify:strategy-knowledge
```

Expected: FAIL because `workers/strategy-knowledge.js` does not exist yet.

- [ ] **Step 4: Create `workers/strategy-knowledge.js` with minimal complete coverage**

Create the module with:

```js
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
```

Then add arrays for:

- `STRATEGY_ENTRIES`: at least one entry per supported regime.
- `INSTRUMENT_GUIDANCE`: at least one entry per supported instrument.
- `RISK_RULES`: all required risk ids.
- `TRANSITION_SIGNALS`: all required transition ids.

Each entry must include `id`, `title`, `source`, `appliesTo` where relevant, and concise strategy text. Use source confidence values from the spec: `direct_pdf`, `derived_from_pdf`, or `local_model_rule`.

- [ ] **Step 5: Add filtering helpers**

Append these exports to `workers/strategy-knowledge.js`:

```js
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
  const terms = String(query || "").toLowerCase().split(/\\s+/).filter(Boolean);

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
```

- [ ] **Step 6: Run validation and verify it passes**

Run:

```bash
npm run verify:strategy-knowledge
```

Expected: `strategy knowledge coverage ok`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json workers/strategy-knowledge.js scripts/verify-strategy-knowledge.mjs
git commit -m "Add strategy knowledge dataset"
```

---

## Task 2: Add Article Context Helpers

**Files:**
- Create: `workers/article-context-utils.js`
- Modify: `scripts/verify-strategy-knowledge.mjs`

- [ ] **Step 1: Extend validation for article helpers**

Update `scripts/verify-strategy-knowledge.mjs` to import:

```js
import {
  getArticlePage,
  getRelevantArticleContext,
  listArticleChunks
} from "../workers/article-context-utils.js";
```

Add checks:

```js
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
```

- [ ] **Step 2: Run validation and verify it fails**

Run:

```bash
npm run verify:strategy-knowledge
```

Expected: FAIL because `workers/article-context-utils.js` does not exist yet.

- [ ] **Step 3: Create article helper module**

Create `workers/article-context-utils.js`:

```js
import { ARTICLE_CHUNKS, ARTICLE_PDF_PATH, ARTICLE_TITLE } from "../functions/_data/articleContext.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;

export function listArticleChunks() {
  return ARTICLE_CHUNKS.map((chunk, index) => ({
    id: `article-chunk-${String(index + 1).padStart(3, "0")}`,
    title: chunk.title,
    text: chunk.text
  }));
}

export function normalizeArticleLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

export function normalizeCursor(cursor) {
  const parsed = Number.parseInt(cursor || "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export function getArticlePage({ cursor, articleLimit } = {}) {
  const offset = normalizeCursor(cursor);
  const limit = normalizeArticleLimit(articleLimit);
  const chunks = listArticleChunks();
  const page = chunks.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    articleTitle: ARTICLE_TITLE,
    articlePdf: ARTICLE_PDF_PATH,
    mode: "full_article",
    chunks: page,
    cursor: nextOffset < chunks.length ? String(nextOffset) : null,
    hasMore: nextOffset < chunks.length
  };
}

export function getRelevantArticleContext({ query, regime, instrument, riskTags = [], articleLimit } = {}) {
  const terms = [
    ...String(query || "").toLowerCase().split(/\\s+/),
    regime,
    instrument,
    ...riskTags
  ].filter(Boolean).map((term) => String(term).toLowerCase().replace(/_/g, " "));

  const chunks = listArticleChunks()
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, normalizeArticleLimit(articleLimit))
    .map(({ score, ...chunk }) => chunk);

  return {
    articleTitle: ARTICLE_TITLE,
    articlePdf: ARTICLE_PDF_PATH,
    mode: "relevant_chunks",
    chunks,
    cursor: null,
    hasMore: false
  };
}

export function buildArticleContext(mode, options = {}) {
  if (mode === "full_article") return getArticlePage(options);
  if (mode === "relevant_chunks") return getRelevantArticleContext(options);
  return {
    articleTitle: ARTICLE_TITLE,
    articlePdf: ARTICLE_PDF_PATH,
    mode: "none",
    chunks: [],
    cursor: null,
    hasMore: false
  };
}
```

- [ ] **Step 4: Run validation**

Run:

```bash
npm run verify:strategy-knowledge
```

Expected: `strategy knowledge coverage ok`

- [ ] **Step 5: Commit**

```bash
git add workers/article-context-utils.js scripts/verify-strategy-knowledge.mjs
git commit -m "Add article context helpers"
```

---

## Task 3: Extract Shared MCP Data Utilities

**Files:**
- Create: `workers/regime-data-utils.js`
- Modify: `workers/regime-mcp.js`

- [ ] **Step 1: Create shared utility module**

Create `workers/regime-data-utils.js` by moving these functions from `workers/regime-mcp.js` unchanged where possible:

- `loadRegimeData`
- `latestAssets`
- `findAssetSeries`
- `normalizeSymbol`
- `findWeek`
- `publicMetadata`
- `publicLinks`
- `marketContextForWeek`
- `compactMarketRow`
- `compactAsset`
- `compactAssetRow`
- `pickMetrics`
- `textResult`
- `errorResult`

Keep constants:

```js
export const DEFAULT_DATA_URL = "https://regimealpha.chenzixin.uk/data/regimes.json";
export const DEFAULT_APP_URL = "https://regimealpha.chenzixin.uk";
```

Export every utility needed by both `regime-mcp.js` and strategy tools.

- [ ] **Step 2: Refactor `workers/regime-mcp.js` imports**

At the top of `workers/regime-mcp.js`, import:

```js
import {
  compactAsset,
  compactAssetRow,
  compactMarketRow,
  errorResult,
  findAssetSeries,
  findWeek,
  latestAssets,
  loadRegimeData,
  marketContextForWeek,
  normalizeSymbol,
  publicLinks,
  publicMetadata,
  textResult
} from "./regime-data-utils.js";
```

Remove the duplicated local helper implementations from `workers/regime-mcp.js`.

- [ ] **Step 3: Run Worker dry-run**

Run:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler deploy --config wrangler.regime-mcp.jsonc --dry-run
```

Expected: build succeeds.

- [ ] **Step 4: Run local MCP smoke test for existing tools**

Start Worker:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler dev --config wrangler.regime-mcp.jsonc --port 8790
```

In another terminal:

```bash
node --input-type=module - <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client = new Client({ name: 'regimealpha-refactor-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:8790/mcp')));
const tools = await client.listTools();
console.log(tools.tools.map((tool) => tool.name).join(','));
const result = await client.callTool({ name: 'get_asset_regime', arguments: { symbol: 'DRAM', historyWeeks: 2 } });
const payload = JSON.parse(result.content[0].text);
console.log(payload.asset.displaySymbol, payload.selected.labelZh);
if (!payload.selected?.code || !payload.selected?.labelZh) throw new Error('Expected selected regime');
await client.close();
NODE
```

Expected output includes existing tools and a DRAM selected regime. Do not require a fixed live label because production data changes over time.

- [ ] **Step 5: Commit**

```bash
git add workers/regime-data-utils.js workers/regime-mcp.js
git commit -m "Extract RegimeAlpha MCP data utilities"
```

---

## Task 4: Add Strategy MCP Tools

**Files:**
- Create: `workers/strategy-tools.js`
- Modify: `workers/regime-mcp.js`
- Create: `scripts/verify-mcp-strategy.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create MCP verification script first**

Create `scripts/verify-mcp-strategy.mjs`:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.REGIME_MCP_URL || "http://localhost:8790/mcp";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = new Client({ name: "regimealpha-strategy-verifier", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));

const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name);
for (const name of [
  "get_strategy_playbook",
  "get_regime_strategy",
  "get_instrument_guidance",
  "map_position_to_regime_risks",
  "search_article_context",
  "get_article_chunks"
]) {
  assert(names.includes(name), `Missing MCP tool ${name}`);
}

const regimeResult = await client.callTool({
  name: "get_regime_strategy",
  arguments: { regime: "sideways_volatile", articleContextMode: "relevant_chunks" }
});
const regimePayload = JSON.parse(regimeResult.content[0].text);
assert(regimePayload.corePrinciples.length >= 7, "Missing core principles");
assert(regimePayload.guardrails.notInvestmentAdvice === true, "Missing guardrails");
assert(regimePayload.matchedStrategies.length > 0, "Expected matched strategies");
assert(regimePayload.articleContext.chunks.length > 0, "Expected relevant article chunks");

const instrumentResult = await client.callTool({
  name: "get_instrument_guidance",
  arguments: { instrument: "otm_options", regime: "sideways_volatile" }
});
const instrumentPayload = JSON.parse(instrumentResult.content[0].text);
assert(instrumentPayload.instrument === "otm_options", "Expected instrument payload");
assert(JSON.stringify(instrumentPayload).includes("theta"), "Expected theta guidance");

const positionResult = await client.callTool({
  name: "map_position_to_regime_risks",
  arguments: {
    positions: [
      { symbol: "DRAM", instrument: "otm_options", side: "long" },
      { symbol: "SOX", instrument: "long_equity", side: "long" },
      { symbol: "BTC", instrument: "etf", side: "long" }
    ],
    useCurrentRegimeData: true
  }
});
const positionPayload = JSON.parse(positionResult.content[0].text);
assert(positionPayload.positions[0].symbol === "DRAM", "Expected DRAM position");
assert(positionPayload.positions[0].currentRegime?.labelZh, "Expected current regime data");
assert(positionPayload.positions[0].riskTags.length > 0, "Expected risk tags");
assert(positionPayload.positions[0].missingInputs.requiredForSpecificAssessment.includes("strike"), "Expected strike missing input");
assert(positionPayload.positions[0].missingInputs.requiredForSpecificAssessment.includes("expiry"), "Expected expiry missing input when absent");
assert(positionPayload.positions[0].missingInputs.usefulForSizing.includes("position size"), "Expected position size missing input");
assert(positionPayload.positions[0].missingInputs.optionalContext.includes("portfolio concentration"), "Expected optional context missing input");
assert(positionPayload.positions[1].normalizedSymbol === "SOXX", "Expected SOX to normalize to SOXX");
assert(positionPayload.positions[2].normalizedSymbol === "BTCUSD", "Expected BTC to normalize to BTCUSD");

const fallbackResult = await client.callTool({
  name: "map_position_to_regime_risks",
  arguments: {
    defaultRegime: "sideways_volatile",
    positions: [{ symbol: "UNKNOWN", instrument: "otm_options", side: "long" }],
    useCurrentRegimeData: true
  }
});
const fallbackPayload = JSON.parse(fallbackResult.content[0].text);
assert(fallbackPayload.positions[0].regimeSource === "defaultRegime", "Expected defaultRegime fallback");
assert(fallbackPayload.positions[0].missingInputs.requiredForSpecificAssessment.includes("expiry"), "Expected expiry missing input");

const invalidRegimeResult = await client.callTool({
  name: "get_regime_strategy",
  arguments: { regime: "not_a_regime" }
});
assert(invalidRegimeResult.isError === true, "Expected invalid regime to be an MCP error result");
assert(invalidRegimeResult.content[0].text.includes("bull_quiet"), "Expected valid regime options in error text");

const invalidInstrumentResult = await client.callTool({
  name: "get_instrument_guidance",
  arguments: { instrument: "not_an_instrument" }
});
assert(invalidInstrumentResult.isError === true, "Expected invalid instrument to be an MCP error result");
assert(invalidInstrumentResult.content[0].text.includes("otm_options"), "Expected valid instrument options in error text");

const invalidPositionResult = await client.callTool({
  name: "map_position_to_regime_risks",
  arguments: {
    positions: [
      { symbol: "DRAM", instrument: "not_an_instrument", regime: "not_a_regime", side: "long" }
    ],
    useCurrentRegimeData: false
  }
});
const invalidPositionPayload = JSON.parse(invalidPositionResult.content[0].text);
assert(invalidPositionPayload.positions[0].errors.length >= 2, "Expected per-position invalid regime and instrument errors");

const regimeWithInstrumentsResult = await client.callTool({
  name: "get_regime_strategy",
  arguments: { regime: "sideways_volatile", includeInstruments: true }
});
const regimeWithInstrumentsPayload = JSON.parse(regimeWithInstrumentsResult.content[0].text);
assert(regimeWithInstrumentsPayload.bestFitInstruments.length > 0, "Expected best-fit instruments");
assert(regimeWithInstrumentsPayload.avoidInstruments.length > 0, "Expected avoid instruments");

const articleResult = await client.callTool({
  name: "get_article_chunks",
  arguments: { articleLimit: 3 }
});
const articlePayload = JSON.parse(articleResult.content[0].text);
assert(articlePayload.chunks.length === 3, "Expected article pagination");
assert(articlePayload.cursor === "3", "Expected next cursor");

const emptyResult = await client.callTool({
  name: "get_strategy_playbook",
  arguments: { regime: "not_a_regime", instrument: "not_an_instrument" }
});
const emptyPayload = JSON.parse(emptyResult.content[0].text);
assert(emptyPayload.validOptions.regimes.length > 0, "Expected valid regime options");
assert(emptyPayload.validOptions.instruments.length > 0, "Expected valid instrument options");
assert(emptyPayload.suggestions.length > 0, "Expected broader query suggestions");

await client.close();
console.log(`strategy MCP verification ok: ${endpoint}`);
```

- [ ] **Step 2: Add package script**

Modify `package.json`:

```json
"verify:mcp-strategy": "node scripts/verify-mcp-strategy.mjs"
```

- [ ] **Step 3: Run script and verify it fails**

Run against local Worker after starting it:

```bash
npm run verify:mcp-strategy
```

Expected: FAIL because strategy tools are not registered yet.

- [ ] **Step 4: Create `workers/strategy-tools.js`**

Implement:

```js
import { z } from "zod";
import { buildArticleContext, getArticlePage, getRelevantArticleContext } from "./article-context-utils.js";
import {
  CORE_PRINCIPLES,
  GUARDRAILS,
  SUPPORTED_INSTRUMENTS,
  SUPPORTED_REGIMES,
  filterRiskRules,
  filterStrategyEntries,
  filterTransitionSignals,
  getInstrumentGuidance,
  normalizeInstrument,
  normalizeRegime
} from "./strategy-knowledge.js";
import {
  compactAssetRow,
  errorResult,
  findAssetSeries,
  findWeek,
  loadRegimeData,
  marketContextForWeek,
  normalizeSymbol,
  publicMetadata,
  textResult
} from "./regime-data-utils.js";

const articleModeSchema = z.enum(["none", "relevant_chunks", "full_article"]).default("none");

function strategyResponse(payload) {
  return textResult({
    corePrinciples: CORE_PRINCIPLES,
    guardrails: GUARDRAILS,
    ...payload
  });
}

export function registerStrategyTools(server, env) {
  server.tool(
    "get_strategy_playbook",
    "Get structured PDF-derived strategy guidance by regime, instrument, risk, or query.",
    {
      regime: z.string().optional(),
      instrument: z.string().optional(),
      risk: z.string().optional(),
      query: z.string().optional(),
      articleContextMode: articleModeSchema,
      articleCursor: z.string().optional(),
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ regime, instrument, risk, query, articleContextMode, articleCursor, articleLimit }) => {
      const mode = articleContextMode || "none";
      const matchedStrategies = filterStrategyEntries({ regime, instrument, risk, query });
      const riskRules = filterRiskRules({ regime, instrument, risk });
      const transitionSignals = filterTransitionSignals({ regime });
      const articleContext = buildArticleContext(mode, {
        cursor: articleCursor,
        articleLimit,
        query,
        regime,
        instrument,
        riskTags: risk ? [risk] : riskRules.map((rule) => rule.id)
      });
      return strategyResponse({ matchedStrategies, riskRules, transitionSignals, articleContext });
    }
  );

  // Add the five remaining tools following the same response pattern.
}
```

Then implement the remaining five tools:

- `get_regime_strategy`
  - Validate regime against `SUPPORTED_REGIMES`.
  - Schema includes `includeInstruments: z.boolean().default(false)`.
  - Return valid options via `errorResult` if invalid.
  - Return matching strategies, risk rules, transition signals, optional relevant article context.
  - If `includeInstruments=true`, add:

```js
{
  bestFitInstruments: INSTRUMENT_GUIDANCE.filter(
    (entry) => entry.regimes?.includes(regime) && entry.fit !== "avoid"
  ),
  avoidInstruments: INSTRUMENT_GUIDANCE.filter(
    (entry) => entry.regimes?.includes(regime) && entry.fit === "avoid"
  )
}
```

  - If no instrument guidance rows declare `fit`, infer best-fit and avoid lists from `STRATEGY_ENTRIES[*].appliesTo.instruments`, `useWhen`, and `avoidWhen`, but always return both arrays.

- `get_instrument_guidance`
  - Validate instrument against `SUPPORTED_INSTRUMENTS`.
  - Return instrument guidance, matching strategies, risk rules, optional relevant article context.

- `map_position_to_regime_risks`
  - Schema includes:
    - `defaultRegime?: string`
    - `positions: z.array(...)`
    - `useCurrentRegimeData: z.boolean().default(true)`
    - `articleContextMode: z.enum(["none","relevant_chunks"]).default("none")`
  - Regime precedence:
    1. if `useCurrentRegimeData=true` and symbol is known, use current asset regime.
    2. else use `position.regime`.
    3. else use `defaultRegime`.
    4. else return missing input `regime`.
  - Normalize holding symbols through the shared `normalizeSymbol()` helper:
    - `SOX` -> `SOXX`
    - `BTC` -> `BTCUSD`
    - otherwise uppercase trimmed symbol.
  - Include both original `symbol` and `normalizedSymbol` in each position result.
  - Return per-position risk tags, matched strategies, missing inputs, current regime data if available.
  - Missing inputs must be grouped exactly as:

```js
{
  requiredForSpecificAssessment: ["expiry", "strike", "moneyness", "implied volatility or IV rank"],
  usefulForSizing: ["position size", "cost basis"],
  optionalContext: ["portfolio concentration", "hedge relationship"]
}
```

  - Build this classification from instrument type. For `otm_options`, `expiry`, `strike`, `moneyness`, and `implied volatility or IV rank` are required if absent; `position size` and `cost basis` are useful for sizing if absent; `portfolio concentration` and `hedge relationship` are optional context.

- Error/no-match behavior:
  - `get_strategy_playbook` should not throw for invalid filters. Return empty `matchedStrategies` plus:

```js
{
  validOptions: { regimes: SUPPORTED_REGIMES, instruments: SUPPORTED_INSTRUMENTS },
  suggestions: [
    "Remove one or more filters and retry.",
    "Use get_regime_strategy for a known regime.",
    "Use get_instrument_guidance for a known instrument."
  ]
}
```

  - `get_regime_strategy` and `get_instrument_guidance` may use `errorResult` for invalid required arguments, but the error text must include valid options.
  - `map_position_to_regime_risks` should return per-position errors for invalid `position.regime` or `position.instrument`, not fail the whole tool call.

- `search_article_context`
  - Inputs: `query`, `articleLimit`.
  - Return `getRelevantArticleContext({ query, articleLimit })`.

- `get_article_chunks`
  - Inputs: `cursor`, `articleLimit`.
  - Return `getArticlePage({ cursor, articleLimit })`.

- [ ] **Step 5: Register tools in `workers/regime-mcp.js`**

Import:

```js
import { registerStrategyTools } from "./strategy-tools.js";
```

Inside `createServer(env)`, after existing data tools:

```js
registerStrategyTools(server, env);
```

- [ ] **Step 6: Run static validation**

Run:

```bash
npm run verify:strategy-knowledge
```

Expected: PASS.

- [ ] **Step 7: Run Worker dry-run**

Run:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler deploy --config wrangler.regime-mcp.jsonc --dry-run
```

Expected: build succeeds.

- [ ] **Step 8: Run local MCP strategy verification**

Start local Worker:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler dev --config wrangler.regime-mcp.jsonc --port 8790
```

In another terminal:

```bash
npm run verify:mcp-strategy
```

Expected: `strategy MCP verification ok: http://localhost:8790/mcp`

- [ ] **Step 9: Commit**

```bash
git add workers/strategy-tools.js workers/regime-mcp.js scripts/verify-mcp-strategy.mjs package.json package-lock.json
git commit -m "Add strategy knowledge MCP tools"
```

---

## Task 5: Add Website MCP/API Usage Instructions

**Files:**
- Modify: `app/components/RegimeDashboard.jsx`
- Modify: `app/globals.css`
- Modify: `README.md`

- [ ] **Step 1: Add MCP usage content to the dashboard**

In `app/components/RegimeDashboard.jsx`, add a new section near the existing source article panel:

```jsx
<section className="mcp-panel">
  <p className="eyebrow">Agent Access</p>
  <h3>数据接口 / MCP</h3>
  <p>其他 agent 可以直接读取 RegimeAlpha 的数据和文章策略知识。</p>
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
```

Use existing page tone. Do not create a landing page or hero. Keep it a functional info panel.

- [ ] **Step 2: Add CSS**

In `app/globals.css`, add `mcp-panel` to the existing panel selector list:

```css
.mcp-panel
```

Then add:

```css
.mcp-panel {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.mcp-panel h3 {
  margin-bottom: 0;
}

.endpoint-list {
  display: grid;
  gap: 8px;
}

.endpoint-list div {
  border: 1px solid var(--line);
  border-radius: 7px;
  display: grid;
  gap: 4px;
  padding: 10px;
}

.endpoint-list span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.endpoint-list code {
  font-family: "SF Mono", "Menlo", monospace;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.mcp-note {
  color: var(--muted);
  margin-bottom: 0;
}
```

- [ ] **Step 3: Update README examples**

Add strategy MCP examples:

```bash
npx mcp-remote https://regimealpha.chenzixin.uk/mcp
REGIME_MCP_URL=https://regimealpha.chenzixin.uk/mcp npm run verify:mcp-strategy
```

List new tools:

- `get_strategy_playbook`
- `get_regime_strategy`
- `get_instrument_guidance`
- `map_position_to_regime_risks`
- `search_article_context`
- `get_article_chunks`

- [ ] **Step 4: Build**

Run:

```bash
npm run build:static
```

Expected: Next build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/components/RegimeDashboard.jsx app/globals.css README.md
git commit -m "Document RegimeAlpha MCP usage on site"
```

---

## Task 6: Deploy and Verify Production

**Files:**
- No source files unless verification reveals defects.

- [ ] **Step 1: Deploy Pages**

Run:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler pages deploy out --project-name regimealpha --branch main
```

Expected: deployment complete with a Pages preview URL.

- [ ] **Step 2: Deploy MCP Worker**

Run:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/wrangler deploy --config wrangler.regime-mcp.jsonc
```

Expected: Worker deployed with route `regimealpha.chenzixin.uk/mcp*`.

- [ ] **Step 3: Verify production MCP strategy tools**

Run:

```bash
REGIME_MCP_URL=https://regimealpha.chenzixin.uk/mcp npm run verify:mcp-strategy
```

Expected:

```text
strategy MCP verification ok: https://regimealpha.chenzixin.uk/mcp
```

- [ ] **Step 4: Verify existing production data tool still works**

Run:

```bash
node --input-type=module - <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client = new Client({ name: 'regimealpha-prod-data-test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('https://regimealpha.chenzixin.uk/mcp')));
const result = await client.callTool({ name: 'compare_assets', arguments: { symbols: ['SOX', 'DRAM', 'BTC'] } });
const payload = JSON.parse(result.content[0].text);
console.log(payload.metadata.dataThrough, payload.assets.map((asset) => `${asset.displaySymbol}:${asset.labelZh}`).join('|'));
await client.close();
NODE
```

Expected output includes `SOX`, `DRAM`, and `BTC` labels.

- [ ] **Step 5: Verify production webpage includes MCP instructions**

Run:

```bash
curl -sS https://regimealpha.chenzixin.uk | rg "mcp-remote|/api/export|/mcp"
```

Expected: all three strings are present in the rendered static HTML.

- [ ] **Step 6: Push branch**

Run:

```bash
git push origin HEAD:main
```

Expected: GitHub main advances.

---

## Final Acceptance Checklist

- [ ] Existing MCP data tools still list and work.
- [ ] New strategy MCP tools list and work.
- [ ] Every strategy tool response includes `corePrinciples` and `guardrails`.
- [ ] `get_article_chunks` paginates with `articleLimit <= 12`.
- [ ] `map_position_to_regime_risks` maps DRAM OTM options to current DRAM regime risk tags.
- [ ] Website shows JSON API, MCP endpoint, and local proxy usage.
- [ ] Production MCP verification passes.
- [ ] Production page verification passes.
