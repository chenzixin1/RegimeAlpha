import { ARTICLE_CHUNKS, ARTICLE_PDF_PATH, ARTICLE_TITLE } from "../_data/articleContext.js";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODELS = ["openrouter/auto", "google/gemini-3.5-flash"];
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function onRequestPost({ request, env }) {
  if (!env.OPENROUTER_API_KEY) {
    return json({ error: "OPENROUTER_API_KEY is not configured." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const question = messages.at(-1)?.content?.trim();
  if (!question) {
    return json({ error: "Missing question." }, 400);
  }

  const marketData = await loadMarketData(request);
  const relevantSymbols = detectRelevantSymbols(question, body.context || {});
  const articleContext = selectArticleContext(question, messages, relevantSymbols);
  const marketContext = buildMarketContext(marketData, body.context || {}, relevantSymbols);

  const openRouterMessages = buildOpenRouterMessages(messages, question, marketContext, articleContext);
  let answer;
  let model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  try {
    let result = await callOpenRouterWithFallback(env, openRouterMessages);
    let payload = result.payload;
    model = result.model;
    answer = payload?.choices?.[0]?.message?.content;
    if (isIncompleteAnswer(answer)) {
      result = await callOpenRouterWithFallback(env, [
        ...openRouterMessages,
        {
          role: "user",
          content: "上一次回答明显不完整或太短。请重新输出完整中文分析：必须有结论、当前状态、因果链、期权框架、触发/失效条件和下一步确认。不要只写开头。"
        }
      ]);
      payload = result.payload;
      model = result.model;
      answer = payload?.choices?.[0]?.message?.content;
    }
  } catch (error) {
    return json({ error: error.message || "OpenRouter request failed." }, 502);
  }

  if (!answer) {
    return json({ error: "OpenRouter returned an empty answer." }, 502);
  }

  return json({
    answer,
    model,
    articleTitle: ARTICLE_TITLE,
    articlePdf: ARTICLE_PDF_PATH,
    dataThrough: marketData?.metadata?.dataThrough || null
  });
}

function buildOpenRouterMessages(messages, question, marketContext, articleContext) {
  return [
    {
      role: "system",
      content: [
        "你是 RegimeAlpha 的连续研究助手，不是一句话问答机器人。用中文回答，除非用户明确要求英文。",
        "你只能基于给定的文章摘录、当前 RegimeAlpha 数据和用户问题回答；没有的数据要明确说缺口，不要编造。",
        "回答必须先给结论，再给证据链，再给可执行的研究框架，最后给风险和需要用户补充的信息。",
        "涉及期权时，必须分析：当前 regime 对方向、波动率、theta、vega、期限结构、OTM/价差结构的影响；只能给研究框架和情景推演，不给个性化买卖指令。",
        "优先引用数据日期、regime 标签、关键指标和文章框架。不要把摘录编号写成 Excerpt 1/2，也不要使用奇怪的英文标题。",
        "如果用户追问“然后呢/啥意思”，要承接前文，把分析推进到下一层，不要重复定义。",
        `原始文章 PDF: ${ARTICLE_PDF_PATH}`
      ].join("\n")
    },
    ...messages.slice(0, -1).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").slice(0, 1200)
    })),
    {
      role: "user",
      content: [
        "【当前 RegimeAlpha 数据摘要】",
        marketContext,
        "",
        "【原始文章相关摘录】",
        articleContext,
        "",
        "【用户当前问题】",
        question,
        "",
        "【回答格式要求】",
        "1. 先用 2-3 句话给结论。",
        "2. 然后用小标题分段：当前状态、为什么会这样、如果是期权该怎么看、触发条件/失效条件、下一步要确认。",
        "3. 如果问题点名某个标的，必须以该标的为主，不要被页面当前选中标的带偏。",
        "4. 语言要像面向投资研究群的分析师，少讲套话，多讲因果链。",
        "5. 结尾必须完整，不要停在括号、冒号或半句话。"
      ].join("\n")
    }
  ];
}

async function callOpenRouterWithFallback(env, messages) {
  const candidates = [env.OPENROUTER_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  let lastError;
  for (const model of uniqueCandidates) {
    try {
      const payload = await callOpenRouter(env, messages, model);
      return { payload, model };
    } catch (error) {
      lastError = error;
      if (!shouldTryFallback(error)) break;
    }
  }
  throw lastError || new Error("OpenRouter request failed.");
}

function shouldTryFallback(error) {
  const message = String(error?.message || "");
  return /not available|model|provider|region|403|404|429|502|503/i.test(message);
}

async function callOpenRouter(env, messages, model) {
  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://regimealpha.chenzixin.uk",
      "x-title": "RegimeAlpha"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2600,
      reasoning: {
        effort: "minimal",
        exclude: true
      },
      messages
    })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`OpenRouter ${upstream.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenRouter returned non-JSON.");
  }
}

function isIncompleteAnswer(answer) {
  const text = String(answer || "").trim();
  if (text.length < 420) return true;
  return /[（(：:，,、]$/.test(text);
}

async function loadMarketData(request) {
  const url = new URL("/data/regimes.json", request.url);
  const response = await fetch(url.toString(), {
    cf: { cacheTtl: 60, cacheEverything: false }
  });
  if (!response.ok) return null;
  return response.json();
}

function buildMarketContext(data, uiContext, relevantSymbols = []) {
  if (!data?.summary?.latest) {
    return "当前市场数据暂不可用。";
  }

  const latest = data.summary.latest;
  const selected = (data.regimes || []).find((row) => row.weekEnd === uiContext.selectedWeek) || latest;
  const assets = data.summary?.assets?.latest || [];
  const assetRegimes = Array.isArray(data.assetRegimes) ? data.assetRegimes : [];
  const relevantAssetRows = findRelevantAssetRows(assets, assetRegimes, relevantSymbols, selected.weekEnd);
  const watchedAssets = assets
    .filter((asset) => ["SOX", "SMH", "DRAM", "BTC", "QQQ", "IGV", "XLE", "XLF"].includes(asset.displaySymbol))
    .map((asset) => formatAssetSummary(asset))
    .join("\n");

  return [
    `metadata: dataThrough=${data.metadata.dataThrough}, requestedEnd=${data.metadata.requestedEnd}, generatedAt=${data.metadata.generatedAt}`,
    `latest market: ${latest.weekEnd} ${latest.labelZh}, confidence=${pct(latest.confidence)}, SPY 13W=${pct(latest.metrics?.ret13w)}, 1W=${pct(latest.metrics?.weeklyReturn)}, VIX=${latest.metrics?.vixClose}, 20D Vol=${pct(latest.metrics?.realizedVol20)}, sectorCorr=${num(latest.metrics?.sectorCorrelation20)}`,
    `selected week: ${selected.weekEnd} ${selected.labelZh}, thesis=${selected.thesis}`,
    `selected asset symbol: ${uiContext.selectedAssetSymbol || "not specified"}`,
    "question-relevant assets:",
    relevantAssetRows.length ? relevantAssetRows.map(formatAssetDetail).join("\n") : "No question-relevant asset detail was detected.",
    "watched assets:",
    watchedAssets || "No watched asset summary available.",
    "regime distribution:",
    (data.summary.byRegime || []).map((item) => `${item.labelZh}: count=${item.count}, avgReturn=${pct(item.avgWeeklyReturn)}`).join("; ")
  ].join("\n");
}

function detectRelevantSymbols(question, uiContext = {}) {
  const query = String(question || "").toUpperCase();
  const aliases = [
    ["DRAM", ["DRAM", "MEMORY", "STORAGE", "存储", "内存", "存储芯片"]],
    ["BTCUSD", ["BTC", "BITCOIN", "比特币"]],
    ["SOXX", ["SOX", "SOXX", "SEMICONDUCTOR", "SEMIS", "半导体"]],
    ["SMH", ["SMH", "MEGA-CAP SEMICONDUCTORS"]],
    ["IGV", ["IGV", "SOFTWARE", "软件"]],
    ["XSW", ["XSW", "EQUAL-WEIGHT SOFTWARE"]],
    ["QQQ", ["QQQ", "NASDAQ", "纳指"]],
    ["SPY", ["SPY", "S&P", "大盘", "标普"]],
    ["IWM", ["IWM", "RUSSELL", "小盘"]],
    ["XLK", ["XLK", "TECHNOLOGY", "科技"]],
    ["XLF", ["XLF", "FINANCIAL", "金融"]],
    ["XLY", ["XLY", "可选消费"]],
    ["XLP", ["XLP", "必需消费"]],
    ["XLE", ["XLE", "ENERGY", "能源"]],
    ["XLV", ["XLV", "HEALTH", "医疗"]],
    ["XLI", ["XLI", "INDUSTRIAL", "工业"]],
    ["XLU", ["XLU", "UTILITIES", "公用事业"]],
    ["XLB", ["XLB", "MATERIALS", "材料"]],
    ["XLRE", ["XLRE", "REAL ESTATE", "地产"]],
    ["XLC", ["XLC", "COMMUNICATION", "通信"]],
    ["IBB", ["IBB", "BIOTECH", "生物科技"]],
    ["KRE", ["KRE", "BANK", "银行"]],
    ["XRT", ["XRT", "RETAIL", "零售"]],
    ["XHB", ["XHB", "HOMEBUILDER", "地产建筑"]],
    ["XOP", ["XOP", "OIL", "油气"]],
    ["XME", ["XME", "METALS", "金属"]],
    ["IYT", ["IYT", "TRANSPORT", "运输"]]
  ];

  const detected = aliases
    .filter(([, terms]) => terms.some((term) => query.includes(term.toUpperCase())))
    .map(([symbol]) => symbol);

  if (uiContext.selectedAssetSymbol) {
    detected.push(normalizeSymbol(uiContext.selectedAssetSymbol));
  }
  detected.push("SPY");

  return [...new Set(detected.filter(Boolean))].slice(0, 6);
}

function normalizeSymbol(symbol) {
  if (!symbol) return null;
  const value = String(symbol).toUpperCase();
  if (value === "SOX") return "SOXX";
  if (value === "BTC") return "BTCUSD";
  return value;
}

function findRelevantAssetRows(assets, assetRegimes, symbols, selectedWeek) {
  return symbols
    .map((symbol) => {
      const latest = assets.find((asset) => asset.symbol === symbol || asset.displaySymbol === symbol);
      const series = assetRegimes.find((asset) => asset.symbol === symbol || asset.displaySymbol === symbol);
      const row = series?.regimes?.find((item) => item.weekEnd === selectedWeek) || series?.regimes?.at(-1);
      return latest || row ? { latest, row } : null;
    })
    .filter(Boolean);
}

function formatAssetSummary(asset) {
  return `${asset.displaySymbol}: ${asset.labelZh}, 1W ${pct(asset.weeklyReturn)}, 13W ${pct(asset.ret13w)}, Rel SPY ${pct(asset.relativeToSpy13w)}, 20D Vol ${pct(asset.realizedVol20)}, confidence ${pct(asset.confidence)}`;
}

function formatAssetDetail({ latest, row }) {
  const asset = latest || row || {};
  const metrics = row?.metrics || asset.metrics || {};
  const drivers = row?.drivers || asset.drivers || [];
  return [
    `${asset.displaySymbol || asset.symbol}: ${asset.name || ""} (${asset.group || ""})`,
    `week=${row?.weekEnd || "latest"}, regime=${row?.labelZh || asset.labelZh}, confidence=${pct(row?.confidence ?? asset.confidence)}`,
    `1W=${pct(metrics.weeklyReturn ?? asset.weeklyReturn)}, 4W=${pct(metrics.ret4w)}, 13W=${pct(metrics.ret13w ?? asset.ret13w)}, relSPY13W=${pct(metrics.relativeToSpy13w ?? asset.relativeToSpy13w)}, 20DVol=${pct(metrics.realizedVol20 ?? asset.realizedVol20)}`,
    `trendEfficiency20=${num(metrics.trendEfficiency20)}, corrToSPY=${num(metrics.correlationToSpy63)}, sectorCorr=${num(metrics.sectorCorrelation20)}, maxDailyMove=${pct(metrics.maxAbsDailyReturn)}, weekRange=${pct(metrics.weekRange)}, drawdown52w=${pct(metrics.drawdown52w)}`,
    `marketCompare=${metrics.marketLabelZh || "n/a"}, thesis=${row?.thesis || "n/a"}, drivers=${drivers.join(" / ") || "n/a"}`
  ].join("; ");
}

function selectArticleContext(question, messages, relevantSymbols = []) {
  const query = [question, ...messages.map((message) => message.content || "")]
    .join(" ")
    .toLowerCase();
  const intentTerms = [
    "regime",
    "transition",
    "volatility",
    "trend",
    "correlation",
    "probability",
    "tvtp",
    "options",
    "drift",
    "state",
    "switching",
    "期权",
    "波动",
    "趋势",
    "切换",
    "概率",
    "状态"
  ];
  const terms = [
    ...new Set([
      ...(query.match(/[a-zA-Z][a-zA-Z\-]{2,}|[\u4e00-\u9fa5]{2,}/g) || []),
      ...intentTerms,
      ...relevantSymbols.map((symbol) => symbol.toLowerCase())
    ])
  ];
  const scored = ARTICLE_CHUNKS.map((chunk, index) => {
    const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
    const score = terms.reduce((total, term) => {
      const normalized = String(term).toLowerCase();
      if (!haystack.includes(normalized)) return total;
      return total + (intentTerms.includes(normalized) ? 2 : 1);
    }, 0);
    return { ...chunk, index, score };
  })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5);

  return scored
    .map((chunk) => `Section - ${chunk.title}\n${chunk.text.slice(0, 1200)}`)
    .join("\n\n");
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function num(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}
