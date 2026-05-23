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
    ...String(query || "").toLowerCase().split(/\s+/),
    regime,
    instrument,
    ...riskTags
  ]
    .filter(Boolean)
    .map((term) => String(term).toLowerCase().replace(/_/g, " "));

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
