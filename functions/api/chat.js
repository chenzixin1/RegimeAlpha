import { ARTICLE_CHUNKS, ARTICLE_PDF_PATH, ARTICLE_TITLE } from "../_data/articleContext.js";

const MODEL = "google/gemini-3.5-flash";
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
  const articleContext = selectArticleContext(question, messages);
  const marketContext = buildMarketContext(marketData, body.context || {});

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": "https://regimealpha.chenzixin.uk",
      "x-title": "RegimeAlpha"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 1400,
      messages: [
        {
          role: "system",
          content: [
            "你是 RegimeAlpha 的研究助手。用中文回答，除非用户明确要求英文。",
            "你只能基于给定的文章摘录、当前 RegimeAlpha 数据和用户问题回答；不要编造不存在的数据。",
            "涉及投资时，表达为研究分析和风险提示，不给个性化买卖建议。",
            "回答要具体，优先引用数据日期、regime 标签、关键指标和文章框架。",
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
            question
          ].join("\n")
        }
      ]
    })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return json({ error: `OpenRouter ${upstream.status}: ${text.slice(0, 500)}` }, 502);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "OpenRouter returned non-JSON." }, 502);
  }

  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer) {
    return json({ error: "OpenRouter returned an empty answer." }, 502);
  }

  return json({
    answer,
    model: MODEL,
    articleTitle: ARTICLE_TITLE,
    articlePdf: ARTICLE_PDF_PATH,
    dataThrough: marketData?.metadata?.dataThrough || null
  });
}

async function loadMarketData(request) {
  const url = new URL("/data/regimes.json", request.url);
  const response = await fetch(url.toString(), {
    cf: { cacheTtl: 60, cacheEverything: false }
  });
  if (!response.ok) return null;
  return response.json();
}

function buildMarketContext(data, uiContext) {
  if (!data?.summary?.latest) {
    return "当前市场数据暂不可用。";
  }

  const latest = data.summary.latest;
  const selected = (data.regimes || []).find((row) => row.weekEnd === uiContext.selectedWeek) || latest;
  const assets = data.summary?.assets?.latest || [];
  const watchedAssets = assets
    .filter((asset) => ["SOX", "SMH", "DRAM", "BTC", "QQQ", "IGV", "XLE", "XLF"].includes(asset.displaySymbol))
    .map((asset) => {
      const metrics = asset.metrics || {};
      return `${asset.displaySymbol}: ${asset.labelZh}, 13W ${pct(metrics.ret13w)}, Rel SPY ${pct(metrics.relativeToSpy13w)}, 20D Vol ${pct(metrics.realizedVol20)}`;
    })
    .join("\n");

  return [
    `metadata: dataThrough=${data.metadata.dataThrough}, requestedEnd=${data.metadata.requestedEnd}, generatedAt=${data.metadata.generatedAt}`,
    `latest market: ${latest.weekEnd} ${latest.labelZh}, confidence=${pct(latest.confidence)}, SPY 13W=${pct(latest.metrics?.ret13w)}, 1W=${pct(latest.metrics?.weeklyReturn)}, VIX=${latest.metrics?.vixClose}, 20D Vol=${pct(latest.metrics?.realizedVol20)}, sectorCorr=${num(latest.metrics?.sectorCorrelation20)}`,
    `selected week: ${selected.weekEnd} ${selected.labelZh}, thesis=${selected.thesis}`,
    `selected asset symbol: ${uiContext.selectedAssetSymbol || "not specified"}`,
    "watched assets:",
    watchedAssets || "No watched asset summary available.",
    "regime distribution:",
    (data.summary.byRegime || []).map((item) => `${item.labelZh}: count=${item.count}, avgReturn=${pct(item.avgWeeklyReturn)}`).join("; ")
  ].join("\n");
}

function selectArticleContext(question, messages) {
  const query = [question, ...messages.map((message) => message.content || "")]
    .join(" ")
    .toLowerCase();
  const terms = [...new Set(query.match(/[a-zA-Z][a-zA-Z\-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [])];
  const scored = ARTICLE_CHUNKS.map((chunk, index) => {
    const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { ...chunk, index, score };
  })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 7);

  return scored
    .map((chunk, index) => `Excerpt ${index + 1} - ${chunk.title}\n${chunk.text}`)
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
