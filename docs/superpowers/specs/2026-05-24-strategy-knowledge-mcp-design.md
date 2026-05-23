# RegimeAlpha Strategy Knowledge MCP Design

## Summary

Add a structured strategy knowledge layer to RegimeAlpha's existing MCP surface. The current MCP exposes regime and asset data. The new layer will expose strategy principles extracted from the currently attached PDF, while keeping the data model extensible for future external articles, research notes, and user postmortems.

The first version focuses on structured research guidance, not automatic trading instructions. Tools should help another agent combine RegimeAlpha data, article-derived strategy rules, and user-provided holdings to identify exposures, risks, missing inputs, and possible adjustment frameworks.

## Goals

- Expose article-derived strategy knowledge through MCP in a stable, structured schema.
- Always include a concise "core principles" summary with strategy responses so agents do not reason from isolated snippets.
- Support regime adaptation, instrument adaptation, risk rules, transition signals, and source attribution.
- Provide optional access to the underlying article context for high-context agents.
- Keep strategy knowledge separate from live regime data while making the two easy to combine.
- Preserve the boundary between research guidance and personalized trade execution.

## Non-Goals

- No automated buy/sell recommendations.
- No brokerage integration or portfolio execution.
- No attempt to ingest every cited paper from the PDF in the first version.
- No UI redesign. This change is primarily MCP/API data surface work.
- No model-generated strategy text at request time; first version should return curated structured data.

## Existing Context

RegimeAlpha already has:

- `/data/regimes.json`: full current data payload.
- `/api/export`: compact JSON export for scripts and non-MCP clients.
- `/mcp`: Cloudflare Workers remote MCP endpoint.
- MCP tools:
  - `get_latest_regime`
  - `get_asset_regime`
  - `compare_assets`
  - `list_regime_weeks`
- `functions/_data/articleContext.js`: extracted PDF chunks used by the chat assistant.
- `data.regimes.json.strategyMap`: regime-level best/avoid strategy metadata used by the page.

The new work should reuse the existing article context and regime taxonomy, but introduce a dedicated strategy knowledge module instead of expanding the market-data JSON with large article-derived prose.

## Architecture

Create a strategy knowledge module that can be imported by the MCP Worker and, optionally, by Pages Functions later:

- `strategyKnowledge`
  - curated, structured strategy entries
  - source metadata
  - always-on core principles
  - risk taxonomy
  - transition signal taxonomy
- `articleContext access`
  - search relevant chunks
  - page through full article chunks
  - attach chunks to strategy responses only when requested
- `MCP tools`
  - strategy tools separate from data tools
  - all strategy tools can optionally include article context

The MCP Worker remains stateless. It fetches current regime data from the existing production data URL when tools need live data, and imports static strategy/article modules at build time.

## Strategy Knowledge Schema

### Core Principles

Every strategy MCP response should include a compressed `corePrinciples` array. These principles are always on, regardless of requested regime or instrument.

Initial principles:

- Regime is a precondition for strategy selection; the same instrument can have opposite risk/reward in different regimes.
- The PDF's TVTP framing cares about persistence and transition probabilities, not only the current regime label.
- Strategy selection should jointly consider direction, realized/implied volatility, correlation, positioning/crowding, and microstructure.
- Sideways/high-volatility regimes are structurally hostile to leverage, LETFs, and naked long OTM options because variance drain, theta decay, and vol crush can overwhelm direction.
- Trend-accelerating regimes can reward momentum and thematic rotation, but require monitoring for crowding, gamma/CTA triggers, and trend-efficiency decay.
- Bull-quiet regimes tend to favor diversified long exposure and cross-sectional alpha; protection can be inefficient when option premium is expensive relative to realized risk.
- Outputs must separate current data observations, article-derived principles, and user-holding inferences.

### Strategy Entry

Each strategy entry should follow this shape:

```json
{
  "id": "sideways_volatile-options-otm-risk",
  "title": "OTM option risk in sideways volatile regimes",
  "source": {
    "article": "Empirical Dynamics of Market Regime Transitions",
    "section": "Options / Sideways Volatile / variance drain",
    "confidence": "derived_from_pdf",
    "chunkIds": ["article-chunk-158"]
  },
  "appliesTo": {
    "regimes": ["sideways_volatile"],
    "instruments": ["options", "otm_options"],
    "assetTypes": ["equity", "sector_etf", "custom_proxy"]
  },
  "principle": "In high-volatility sideways regimes, naked long OTM options are vulnerable to theta decay and vol crush because price direction is discontinuous and volatility premium is high.",
  "useWhen": ["Defined event risk exists", "Breakout trigger is explicit"],
  "avoidWhen": ["Direction view is vague", "IV is elevated", "Trend efficiency is weak"],
  "watch": ["realizedVol20", "trendEfficiency20", "weekRange", "maxAbsDailyReturn", "ivRank"],
  "risks": ["vol_crush", "theta_decay", "whipsaw"],
  "positionMapping": {
    "long_otm_call": "Check IV, trigger level, time to expiry, and whether vertical/calendar structures reduce premium risk.",
    "long_equity": "Focus on sizing and drawdown tolerance rather than only direction."
  }
}
```

### Risk Rule

Risk rules should be reusable across regimes and instruments:

```json
{
  "id": "variance_drain",
  "label": "Variance drain",
  "description": "Daily rebalanced leverage can lose capital in high-amplitude sideways movement even when the underlying has little net change.",
  "mostRelevantRegimes": ["sideways_volatile", "bear_volatile", "microstructure_dislocation"],
  "mostRelevantInstruments": ["letf", "leveraged_etf"],
  "watch": ["realizedVol20", "weekRange", "serialAutocorr20"]
}
```

### Transition Signal

Transition signals connect the PDF's TVTP idea with RegimeAlpha metrics:

```json
{
  "id": "high_vol_to_trend_acceleration",
  "fromRegimes": ["sideways_volatile", "mean_reverting"],
  "toRegimes": ["trend_accelerating"],
  "description": "A high-volatility chop can become trend acceleration when realized volatility compresses, trend efficiency rises, and leadership correlation improves.",
  "watch": ["trendEfficiency20", "sectorCorrelation20", "relativeToSpy13w", "weekRange"]
}
```

## Article Context Modes

Strategy tools should default to structured output but allow high-context agents to request article text.

Supported modes:

- `none`: return only structured strategy knowledge. This is the default.
- `relevant_chunks`: return article chunks matching regime, instrument, risk tags, and free-text query.
- `full_article`: return paginated article chunks. Never dump the whole article in one response.

Article payload:

```json
{
  "articleTitle": "Empirical Dynamics of Market Regime Transitions",
  "articlePdf": "/articles/market-regime-transition-probability-study.pdf",
  "mode": "relevant_chunks",
  "chunks": [
    {
      "id": "article-chunk-158",
      "title": "The practical, commercial application...",
      "text": "..."
    }
  ],
  "cursor": null,
  "hasMore": false
}
```

For `full_article`, use `cursor` and `limit` with a conservative maximum so agents can pull the full text iteratively.

## MCP Tool Design

Add these tools to the existing MCP server.

### `get_strategy_playbook`

Purpose: General strategy query across regimes, instruments, risks, and article context.

Inputs:

- `regime?: string`
- `instrument?: string`
- `risk?: string`
- `query?: string`
- `articleContextMode?: "none" | "relevant_chunks" | "full_article"`
- `articleCursor?: string`
- `articleLimit?: number`

Output:

- `corePrinciples`
- `matchedStrategies`
- `riskRules`
- `transitionSignals`
- `articleContext`
- `guardrails`

### `get_regime_strategy`

Purpose: Strategy framework for one regime.

Inputs:

- `regime: string`
- `includeInstruments?: boolean`
- `articleContextMode?: "none" | "relevant_chunks"`

Output:

- `corePrinciples`
- regime summary
- best-fit instruments
- avoid/fragility rules
- watch metrics
- relevant transition signals
- optional article chunks

### `get_instrument_guidance`

Purpose: Instrument-specific guidance across regimes.

Inputs:

- `instrument: "long_equity" | "etf" | "letf" | "options" | "otm_options" | "spreads" | "hedge" | "cash"`
- `regime?: string`
- `articleContextMode?: "none" | "relevant_chunks"`

Output:

- instrument behavior by regime
- risks
- preferred structures
- avoid conditions
- missing inputs needed for position-specific analysis

### `map_position_to_regime_risks`

Purpose: Map user-provided holding descriptions to strategy risks and missing inputs.

Inputs:

```json
{
  "positions": [
    {
      "symbol": "DRAM",
      "instrument": "otm_options",
      "side": "long",
      "expiry": "2026-09-18",
      "strike": null,
      "costBasis": null,
      "positionSizePct": null
    }
  ],
  "useCurrentRegimeData": true,
  "articleContextMode": "none"
}
```

Output:

- per-position current regime data if available
- matched strategy entries
- risk tags
- missing inputs
- non-instructional adjustment framework
- guardrails

This tool must not say "buy", "sell", "add", or "close" as an instruction. It can say "evaluate whether X structure reduces Y risk" or "the holding is exposed to theta and vol crush under current regime."

### `search_article_context`

Purpose: Search PDF chunks directly.

Inputs:

- `query: string`
- `limit?: number`

Output:

- matched article chunks
- article metadata

### `get_article_chunks`

Purpose: Paginate through complete article content for high-context agents.

Inputs:

- `cursor?: string`
- `limit?: number`

Output:

- chunks
- cursor
- hasMore
- article metadata

## JSON API Design

Keep `/api/export` focused on data. Do not add large article or strategy payloads there by default.

Optionally add a future lightweight endpoint:

- `/api/strategy?regime=sideways_volatile&instrument=options`

This is not required for the first MCP-first version unless implementation is trivial after the MCP module is built.

## Source Attribution

Each strategy entry should indicate whether it is:

- `direct_pdf`: closely follows explicit article language.
- `derived_from_pdf`: a concise operationalization of article principles.
- `local_model_rule`: inherited from RegimeAlpha's rule taxonomy.
- `user_note`: future user-authored notes.

For the first version, do not claim exact page citations unless reliable page metadata exists. Use article title, section label, and chunk IDs.

## Holding Input Boundary

`map_position_to_regime_risks` accepts incomplete holdings. The output should make missing data explicit instead of guessing.

Common missing inputs:

- option expiry
- strike
- moneyness
- implied volatility / IV rank
- cost basis
- current price
- position size
- portfolio concentration
- hedge relationship

The response should classify missing inputs by importance:

- `requiredForSpecificAssessment`
- `usefulForSizing`
- `optionalContext`

## Error Handling

- Unknown regime: return valid regime options.
- Unknown instrument: return valid instrument options.
- Unknown asset symbol in holdings: still return generic instrument/regime guidance if a regime is supplied; otherwise report missing live regime data.
- `full_article` too large: enforce max `articleLimit` and require pagination.
- No matched strategy: return core principles, valid filters, and suggestions for broader query.

## Testing

Unit-level checks:

- strategy filters match by regime, instrument, risk, and free-text query.
- every strategy response includes `corePrinciples` and `guardrails`.
- `full_article` pagination is deterministic and eventually reaches `hasMore=false`.
- `SOX` normalizes to `SOXX`; `BTC` normalizes to `BTCUSD` when holdings use symbols.
- incomplete positions produce `missingInputs`, not fabricated values.

Integration checks:

- MCP lists existing data tools plus new strategy/article tools.
- `get_regime_strategy(sideways_volatile)` returns options/LETF risk rules.
- `get_instrument_guidance(otm_options, sideways_volatile)` returns theta, vol crush, and whipsaw risks.
- `map_position_to_regime_risks` with a DRAM OTM option references the current DRAM regime and strategy risk tags.
- `get_article_chunks` can paginate through all current article chunks.

Production checks:

- deploy Cloudflare Worker.
- call production `/mcp` using the MCP SDK client.
- verify existing tools still work.
- verify no secret values are returned.

## Rollout

1. Add strategy knowledge module with curated entries for the current PDF.
2. Add article chunk ids if missing.
3. Add strategy and article tools to the existing MCP Worker.
4. Add tests or scripted MCP verification commands.
5. Deploy Worker.
6. Update README with strategy MCP usage examples.

## Success Criteria

- Another agent can call `/mcp` and retrieve strategy guidance for a regime or instrument without reading the full PDF.
- Another agent can optionally retrieve relevant chunks or paginate through the complete article.
- Position-risk mapping works with incomplete holdings and returns useful missing-input prompts.
- The system clearly separates data observations, article-derived principles, and holding inferences.
- Existing regime-data MCP tools remain unchanged and verified.
