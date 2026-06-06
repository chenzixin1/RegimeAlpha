import { z } from "zod";
import { buildArticleContext, getArticlePage, getRelevantArticleContext } from "./article-context-utils.js";
import {
  CORE_PRINCIPLES,
  GUARDRAILS,
  INSTRUMENT_GUIDANCE,
  SUPPORTED_INSTRUMENTS,
  SUPPORTED_REGIMES,
  filterRiskRules,
  filterStrategyEntries,
  filterTransitionSignals,
  getInstrumentGuidance,
  getRegimeInstrumentFit,
  normalizeInstrument,
  normalizeRegime
} from "./strategy-knowledge.js";
import {
  compactAssetRow,
  errorResult,
  findAssetSeries,
  loadRegimeData,
  normalizeSymbol,
  publicMetadata,
  textResult
} from "./regime-data-utils.js";

const articleModeSchema = z.enum(["none", "relevant_chunks", "full_article"]).default("none");
const limitedArticleModeSchema = z.enum(["none", "relevant_chunks"]).default("none");

function strategyResponse(payload) {
  return textResult({
    corePrinciples: CORE_PRINCIPLES,
    guardrails: GUARDRAILS,
    ...payload
  });
}

function validOptions() {
  return { regimes: SUPPORTED_REGIMES, instruments: SUPPORTED_INSTRUMENTS };
}

function suggestions() {
  return [
    "Remove one or more filters and retry.",
    "Use get_regime_strategy for a known regime.",
    "Use get_instrument_guidance for a known instrument."
  ];
}

function isValidRegime(regime) {
  return SUPPORTED_REGIMES.includes(normalizeRegime(regime));
}

function isValidInstrument(instrument) {
  return SUPPORTED_INSTRUMENTS.includes(normalizeInstrument(instrument));
}

function latestAssetRow(asset) {
  return asset?.regimes?.at(-1) || null;
}

function missingInputsForPosition(position, instrument, resolvedRegime) {
  const requiredForSpecificAssessment = [];
  const usefulForSizing = [];
  const optionalContext = [];

  if (!resolvedRegime) requiredForSpecificAssessment.push("regime");

  if (instrument === "otm_options") {
    if (!position.expiry) requiredForSpecificAssessment.push("expiry");
    if (!position.strike) requiredForSpecificAssessment.push("strike");
    if (!position.moneyness) requiredForSpecificAssessment.push("moneyness");
    if (!position.impliedVolatility && !position.ivRank) {
      requiredForSpecificAssessment.push("implied volatility or IV rank");
    }
    if (!position.positionSizePct && !position.positionSize) usefulForSizing.push("position size");
    if (!position.costBasis) usefulForSizing.push("cost basis");
    if (!position.portfolioConcentration) optionalContext.push("portfolio concentration");
    if (!position.hedgeRelationship) optionalContext.push("hedge relationship");
  } else {
    if (!position.positionSizePct && !position.positionSize) usefulForSizing.push("position size");
    if (!position.costBasis) usefulForSizing.push("cost basis");
    if (!position.portfolioConcentration) optionalContext.push("portfolio concentration");
  }

  return { requiredForSpecificAssessment, usefulForSizing, optionalContext };
}

function collectRiskTags(strategies, riskRules, guidance) {
  return [
    ...new Set([
      ...strategies.flatMap((entry) => entry.risks || []),
      ...riskRules.map((rule) => rule.id),
      ...guidance.flatMap((entry) => entry.risks || [])
    ])
  ];
}

function validationError(label, value, options) {
  return `${label} "${value}" is not supported. Valid options: ${options.join(", ")}`;
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
      const normalizedRegime = normalizeRegime(regime);
      const normalizedInstrument = normalizeInstrument(instrument);
      const invalidFilters = {
        regime: normalizedRegime && !SUPPORTED_REGIMES.includes(normalizedRegime) ? regime : null,
        instrument: normalizedInstrument && !SUPPORTED_INSTRUMENTS.includes(normalizedInstrument) ? instrument : null
      };
      const effectiveRegime = invalidFilters.regime ? undefined : regime;
      const effectiveInstrument = invalidFilters.instrument ? undefined : instrument;
      const matchedStrategies = invalidFilters.regime || invalidFilters.instrument
        ? []
        : filterStrategyEntries({ regime: effectiveRegime, instrument: effectiveInstrument, risk, query });
      const riskRules = invalidFilters.regime || invalidFilters.instrument
        ? []
        : filterRiskRules({ regime: effectiveRegime, instrument: effectiveInstrument, risk });
      const transitionSignals = invalidFilters.regime ? [] : filterTransitionSignals({ regime: effectiveRegime });
      const articleContext = buildArticleContext(mode, {
        cursor: articleCursor,
        articleLimit,
        query,
        regime: effectiveRegime,
        instrument: effectiveInstrument,
        riskTags: risk ? [risk] : riskRules.map((rule) => rule.id)
      });
      return strategyResponse({
        filters: { regime, instrument, risk, query },
        invalidFilters,
        matchedStrategies,
        riskRules,
        transitionSignals,
        articleContext,
        ...(matchedStrategies.length === 0 ? { validOptions: validOptions(), suggestions: suggestions() } : {})
      });
    }
  );

  server.tool(
    "get_regime_strategy",
    "Get strategy guidance for one RegimeAlpha regime.",
    {
      regime: z.string(),
      includeInstruments: z.boolean().default(false),
      articleContextMode: limitedArticleModeSchema,
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ regime, includeInstruments, articleContextMode, articleLimit }) => {
      const normalizedRegime = normalizeRegime(regime);
      if (!SUPPORTED_REGIMES.includes(normalizedRegime)) {
        return errorResult(validationError("Regime", regime, SUPPORTED_REGIMES));
      }
      const matchedStrategies = filterStrategyEntries({ regime: normalizedRegime });
      const riskRules = filterRiskRules({ regime: normalizedRegime });
      const transitionSignals = filterTransitionSignals({ regime: normalizedRegime });
      const articleContext = buildArticleContext(articleContextMode, {
        regime: normalizedRegime,
        articleLimit,
        riskTags: riskRules.map((rule) => rule.id)
      });
      const instrumentFit = includeInstruments ? getRegimeInstrumentFit(normalizedRegime) : {};
      return strategyResponse({
        regime: normalizedRegime,
        summary: matchedStrategies[0]?.principle || null,
        matchedStrategies,
        riskRules,
        transitionSignals,
        articleContext,
        ...instrumentFit
      });
    }
  );

  server.tool(
    "get_instrument_guidance",
    "Get instrument-specific strategy guidance across regimes.",
    {
      instrument: z.string(),
      regime: z.string().optional(),
      articleContextMode: limitedArticleModeSchema,
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ instrument, regime, articleContextMode, articleLimit }) => {
      const normalizedInstrument = normalizeInstrument(instrument);
      const normalizedRegime = normalizeRegime(regime);
      if (!SUPPORTED_INSTRUMENTS.includes(normalizedInstrument)) {
        return errorResult(validationError("Instrument", instrument, SUPPORTED_INSTRUMENTS));
      }
      if (normalizedRegime && !SUPPORTED_REGIMES.includes(normalizedRegime)) {
        return errorResult(validationError("Regime", regime, SUPPORTED_REGIMES));
      }
      const guidance = getInstrumentGuidance(normalizedInstrument, normalizedRegime);
      const matchedStrategies = filterStrategyEntries({ regime: normalizedRegime, instrument: normalizedInstrument });
      const riskRules = filterRiskRules({ regime: normalizedRegime, instrument: normalizedInstrument });
      const articleContext = buildArticleContext(articleContextMode, {
        regime: normalizedRegime,
        instrument: normalizedInstrument,
        articleLimit,
        riskTags: collectRiskTags(matchedStrategies, riskRules, guidance)
      });
      return strategyResponse({
        instrument: normalizedInstrument,
        regime: normalizedRegime || null,
        guidance,
        matchedStrategies,
        riskRules,
        articleContext
      });
    }
  );

  server.tool(
    "map_position_to_regime_risks",
    "Map user holding descriptions to regime risks, strategy entries, and missing inputs without giving trading instructions.",
    {
      defaultRegime: z.string().optional(),
      positions: z.array(z.object({
        symbol: z.string(),
        instrument: z.string(),
        regime: z.string().nullable().optional(),
        side: z.string().optional(),
        expiry: z.string().optional(),
        strike: z.union([z.string(), z.number()]).optional(),
        moneyness: z.string().optional(),
        impliedVolatility: z.union([z.string(), z.number()]).optional(),
        ivRank: z.union([z.string(), z.number()]).optional(),
        costBasis: z.union([z.string(), z.number()]).optional(),
        positionSize: z.union([z.string(), z.number()]).optional(),
        positionSizePct: z.union([z.string(), z.number()]).optional(),
        portfolioConcentration: z.string().optional(),
        hedgeRelationship: z.string().optional()
      })).min(1).max(50),
      useCurrentRegimeData: z.boolean().default(true),
      articleContextMode: limitedArticleModeSchema,
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ defaultRegime, positions, useCurrentRegimeData, articleContextMode, articleLimit }) => {
      const data = useCurrentRegimeData ? await loadRegimeData(env) : null;
      const normalizedDefaultRegime = normalizeRegime(defaultRegime);
      const defaultRegimeValid = !normalizedDefaultRegime || SUPPORTED_REGIMES.includes(normalizedDefaultRegime);
      const mapped = positions.map((position) => {
        const normalizedInstrument = normalizeInstrument(position.instrument);
        const normalizedPositionRegime = normalizeRegime(position.regime);
        const errors = [];
        if (!SUPPORTED_INSTRUMENTS.includes(normalizedInstrument)) {
          errors.push(validationError("Instrument", position.instrument, SUPPORTED_INSTRUMENTS));
        }
        if (normalizedPositionRegime && !SUPPORTED_REGIMES.includes(normalizedPositionRegime)) {
          errors.push(validationError("Regime", position.regime, SUPPORTED_REGIMES));
        }
        if (normalizedDefaultRegime && !defaultRegimeValid) {
          errors.push(validationError("Default regime", defaultRegime, SUPPORTED_REGIMES));
        }

        const normalized = normalizeSymbol(position.symbol);
        const asset = data ? findAssetSeries(data, normalized) : null;
        const row = latestAssetRow(asset);
        let resolvedRegime = null;
        let regimeSource = null;
        if (row?.code) {
          resolvedRegime = row.code;
          regimeSource = "currentRegimeData";
        } else if (normalizedPositionRegime && SUPPORTED_REGIMES.includes(normalizedPositionRegime)) {
          resolvedRegime = normalizedPositionRegime;
          regimeSource = "position.regime";
        } else if (defaultRegimeValid && normalizedDefaultRegime) {
          resolvedRegime = normalizedDefaultRegime;
          regimeSource = "defaultRegime";
        }

        const matchedStrategies = SUPPORTED_INSTRUMENTS.includes(normalizedInstrument)
          ? filterStrategyEntries({ regime: resolvedRegime, instrument: normalizedInstrument })
          : [];
        const riskRules = SUPPORTED_INSTRUMENTS.includes(normalizedInstrument)
          ? filterRiskRules({ regime: resolvedRegime, instrument: normalizedInstrument })
          : [];
        const guidance = SUPPORTED_INSTRUMENTS.includes(normalizedInstrument)
          ? getInstrumentGuidance(normalizedInstrument, resolvedRegime)
          : [];
        const riskTags = collectRiskTags(matchedStrategies, riskRules, guidance);

        return {
          symbol: position.symbol,
          normalizedSymbol: normalized,
          instrument: normalizedInstrument,
          side: position.side || null,
          regime: resolvedRegime,
          regimeSource,
          currentRegime: row ? compactAssetRow(row) : null,
          riskTags,
          matchedStrategies,
          riskRules,
          missingInputs: missingInputsForPosition(position, normalizedInstrument, resolvedRegime),
          adjustmentFramework: [
            "Compare current regime persistence versus transition signals.",
            "Evaluate whether defined-risk structures reduce theta, variance-drain, or short-gamma exposure.",
            "Verify missing inputs before making position-specific decisions."
          ],
          errors
        };
      });

      const allRiskTags = [...new Set(mapped.flatMap((position) => position.riskTags))];
      const articleContext = buildArticleContext(articleContextMode, {
        query: mapped.map((position) => `${position.symbol} ${position.instrument} ${position.regime || ""}`).join(" "),
        riskTags: allRiskTags,
        articleLimit
      });

      return strategyResponse({
        metadata: data ? publicMetadata(data) : null,
        positions: mapped,
        articleContext
      });
    }
  );

  server.tool(
    "search_article_context",
    "Search the PDF-derived article chunks directly.",
    {
      query: z.string(),
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ query, articleLimit }) => strategyResponse(getRelevantArticleContext({ query, articleLimit }))
  );

  server.tool(
    "get_article_chunks",
    "Paginate through the complete PDF-derived article chunks for high-context agents.",
    {
      cursor: z.string().optional(),
      articleLimit: z.number().int().min(1).max(12).default(5)
    },
    async ({ cursor, articleLimit }) => strategyResponse(getArticlePage({ cursor, articleLimit }))
  );
}
