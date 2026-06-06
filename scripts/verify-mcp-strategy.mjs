import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.REGIME_MCP_URL || "http://localhost:8790/mcp";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function callTool(name, args) {
  console.log(`verify ${name}`);
  const callClient = new Client({ name: `regimealpha-strategy-verifier-${name}`, version: "1.0.0" });
  await callClient.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  try {
    return await callClient.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  } finally {
    await callClient.close().catch(() => {});
  }
}

const client = new Client({ name: "regimealpha-strategy-verifier-list", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
const tools = await client.listTools();
await client.close().catch(() => {});
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

const regimeResult = await callTool("get_regime_strategy", { regime: "sideways_volatile", articleContextMode: "relevant_chunks" });
const regimePayload = JSON.parse(regimeResult.content[0].text);
assert(regimePayload.corePrinciples.length >= 7, "Missing core principles");
assert(regimePayload.guardrails.notInvestmentAdvice === true, "Missing guardrails");
assert(regimePayload.matchedStrategies.length > 0, "Expected matched strategies");
assert(regimePayload.articleContext.chunks.length > 0, "Expected relevant article chunks");

const instrumentResult = await callTool("get_instrument_guidance", { instrument: "otm_options", regime: "sideways_volatile" });
const instrumentPayload = JSON.parse(instrumentResult.content[0].text);
assert(instrumentPayload.instrument === "otm_options", "Expected instrument payload");
assert(JSON.stringify(instrumentPayload).includes("theta"), "Expected theta guidance");

const positionResult = await callTool("map_position_to_regime_risks", {
  positions: [
    { symbol: "DRAM", instrument: "otm_options", side: "long" },
    { symbol: "SOX", instrument: "long_equity", side: "long" },
    { symbol: "BTC", instrument: "etf", side: "long" }
  ],
  useCurrentRegimeData: true
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

const fallbackResult = await callTool("map_position_to_regime_risks", {
  defaultRegime: "sideways_volatile",
  positions: [{ symbol: "UNKNOWN", instrument: "otm_options", side: "long" }],
  useCurrentRegimeData: true
});
const fallbackPayload = JSON.parse(fallbackResult.content[0].text);
assert(fallbackPayload.positions[0].regimeSource === "defaultRegime", "Expected defaultRegime fallback");
assert(fallbackPayload.positions[0].missingInputs.requiredForSpecificAssessment.includes("expiry"), "Expected expiry missing input");

const invalidRegimeResult = await callTool("get_regime_strategy", { regime: "not_a_regime" });
assert(invalidRegimeResult.isError === true, "Expected invalid regime to be an MCP error result");
assert(invalidRegimeResult.content[0].text.includes("bull_quiet"), "Expected valid regime options in error text");

const invalidInstrumentResult = await callTool("get_instrument_guidance", { instrument: "not_an_instrument" });
assert(invalidInstrumentResult.isError === true, "Expected invalid instrument to be an MCP error result");
assert(invalidInstrumentResult.content[0].text.includes("otm_options"), "Expected valid instrument options in error text");

const invalidPositionResult = await callTool("map_position_to_regime_risks", {
  positions: [
    { symbol: "DRAM", instrument: "not_an_instrument", regime: "not_a_regime", side: "long" }
  ],
  useCurrentRegimeData: false
});
const invalidPositionPayload = JSON.parse(invalidPositionResult.content[0].text);
assert(invalidPositionPayload.positions[0].errors.length >= 2, "Expected per-position invalid regime and instrument errors");

const regimeWithInstrumentsResult = await callTool("get_regime_strategy", { regime: "sideways_volatile", includeInstruments: true });
const regimeWithInstrumentsPayload = JSON.parse(regimeWithInstrumentsResult.content[0].text);
assert(regimeWithInstrumentsPayload.bestFitInstruments.length > 0, "Expected best-fit instruments");
assert(regimeWithInstrumentsPayload.avoidInstruments.length > 0, "Expected avoid instruments");

const articleResult = await callTool("get_article_chunks", { articleLimit: 3 });
const articlePayload = JSON.parse(articleResult.content[0].text);
assert(articlePayload.chunks.length === 3, "Expected article pagination");
assert(articlePayload.cursor === "3", "Expected next cursor");

const emptyResult = await callTool("get_strategy_playbook", { regime: "not_a_regime", instrument: "not_an_instrument" });
const emptyPayload = JSON.parse(emptyResult.content[0].text);
assert(emptyPayload.validOptions.regimes.length > 0, "Expected valid regime options");
assert(emptyPayload.validOptions.instruments.length > 0, "Expected valid instrument options");
assert(emptyPayload.suggestions.length > 0, "Expected broader query suggestions");

console.log(`strategy MCP verification ok: ${endpoint}`);
