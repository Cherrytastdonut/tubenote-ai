const { safeWikipediaUrl } = require("../lib/analysis");

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const USER_AGENT = "TubeNoteAI/2.0 (https://github.com/Cherrytastdonut/tubenote-ai)";

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

async function findArticle(query, language) {
  if (!query) return null;
  const cacheKey = language + ":" + query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.article;

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "0",
    gsrlimit: "3",
    prop: "info|pageprops",
    ppprop: "disambiguation",
    inprop: "url",
    format: "json",
    formatversion: "2"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch("https://" + language + ".wikipedia.org/w/api.php?" + params, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Wikipedia HTTP " + response.status);
    const payload = await response.json();
    if (payload.error) throw new Error("Wikipedia query failed");
    const pages = Array.isArray(payload.query?.pages) ? payload.query.pages : [];
    const page = pages
      .filter((item) => !item.missing && item.ns === 0 && !Object.prototype.hasOwnProperty.call(item.pageprops || {}, "disambiguation"))
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .find((item) => safeWikipediaUrl(item.fullurl));
    const article = page ? {
      title: clean(page.title, 200),
      url: safeWikipediaUrl(page.fullurl),
      language
    } : null;
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { article, expires: Date.now() + CACHE_TTL });
    return article;
  } finally {
    clearTimeout(timeout);
  }
}

async function findTopic(topic) {
  let failed = false;
  let article = null;
  try { article = await findArticle(topic.query, "ko"); } catch { failed = true; }
  if (!article && topic.english_query) {
    try { article = await findArticle(topic.english_query, "en"); } catch { failed = true; }
  }
  return { article: article ? { ...article, reason: topic.reason } : null, failed };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
    }
  }
  if (!Array.isArray(body?.topics) || body.topics.length > 4) {
    return res.status(400).json({ error: "검색할 개념을 1~4개 보내 주세요." });
  }
  const topics = body.topics.map((item) => ({
    query: clean(item?.query, 100),
    english_query: clean(item?.english_query, 100),
    reason: clean(item?.reason, 400)
  })).filter((item) => item.query);
  if (!topics.length) return res.status(200).json({ links: [], status: "empty" });

  // At most two concurrent Wikipedia lookups; each has a bounded timeout.
  const results = [];
  for (let index = 0; index < topics.length; index += 2) {
    results.push(...await Promise.all(topics.slice(index, index + 2).map(findTopic)));
  }
  const seen = new Set();
  const links = results.map((item) => item.article).filter((article) => {
    if (!article || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
  const hasFailure = results.some((item) => item.failed);
  const status = links.length ? (hasFailure ? "partial" : "ready") : (hasFailure ? "error" : "empty");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ links, status });
};
