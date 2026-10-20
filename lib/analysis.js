const ANALYSIS_VERSION = 2;

function text(value, limit = 800) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeWikipediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!["ko.wikipedia.org", "en.wikipedia.org"].includes(url.hostname)) return "";
    return url.pathname.startsWith("/wiki/") ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeAnalysis(input, version = ANALYSIS_VERSION) {
  const data = input && typeof input === "object" ? input : {};
  const title = text(data.title, 500);
  const summary = text(data.summary, 12000);
  const keyPoints = (Array.isArray(data.key_points) ? data.key_points : [])
    .slice(0, 12)
    .map((item) => ({ timestamp: text(item?.timestamp, 24), point: text(item?.point, 1600) }))
    .filter((item) => item.point);

  const sourceMap = data.mind_map;
  const branches = (Array.isArray(sourceMap?.branches) ? sourceMap.branches : [])
    .slice(0, 6)
    .map((branch) => ({
      title: text(branch?.title, 80),
      description: text(branch?.description, 1200),
      children: (Array.isArray(branch?.children) ? branch.children : [])
        .slice(0, 4)
        .map((child) => ({ title: text(child?.title, 80), description: text(child?.description, 1200) }))
        .filter((child) => child.title && child.description)
    }))
    .filter((branch) => branch.title && branch.description);
  const hasMap = Boolean(text(sourceMap?.title, 80) && branches.length);
  const mindMap = hasMap ? {
    title: text(sourceMap.title, 80),
    description: text(sourceMap.description, 1600) || summary,
    branches
  } : {
    title: title || "영상의 핵심 내용",
    description: summary || "저장된 핵심 포인트를 연결한 마인드맵입니다.",
    branches: keyPoints.slice(0, 6).map((item) => ({
      title: item.point.length > 48 ? item.point.slice(0, 48) + "…" : item.point,
      description: item.point,
      children: []
    }))
  };

  // AI estimates difficulty for a general Korean reader. The server also
  // requires context, a usable explanation, and an exact occurrence in the text.
  const bodyText = [summary, ...keyPoints.map((item) => item.point)].join("\n");
  const seenTerms = new Set();
  const glossary = (Array.isArray(data.glossary) ? data.glossary : [])
    .slice(0, 40)
    .map((item) => ({
      term: text(item?.term, 80),
      kind: text(item?.kind, 40),
      difficulty_score: typeof item?.difficulty_score === "number" ? item.difficulty_score : 0,
      context_required: item?.context_required === true,
      explanation: text(item?.explanation, 1200)
    }))
    .filter((item) => {
      if (item.term.length < 2 || !item.explanation || !item.context_required) return false;
      if (item.difficulty_score < 60 || item.difficulty_score > 100 || !Number.isFinite(item.difficulty_score)) return false;
      if (!bodyText.includes(item.term) || seenTerms.has(item.term)) return false;
      seenTerms.add(item.term);
      return true;
    })
    .slice(0, 16);

  const seenTopics = new Set();
  const wikiTopics = (Array.isArray(data.wiki_topics) ? data.wiki_topics : [])
    .slice(0, 12)
    .map((item) => ({
      query: text(item?.query, 100),
      english_query: text(item?.english_query, 100),
      reason: text(item?.reason, 400)
    }))
    .filter((item) => {
      if (!item.query || seenTopics.has(item.query)) return false;
      seenTopics.add(item.query);
      return true;
    })
    .slice(0, 4);
  const seenUrls = new Set();
  const wikiLinks = (Array.isArray(data.wiki_links) ? data.wiki_links : [])
    .slice(0, 8)
    .map((item) => ({
      title: text(item?.title, 200),
      url: safeWikipediaUrl(item?.url),
      language: item?.language === "en" ? "en" : "ko",
      reason: text(item?.reason, 400)
    }))
    .filter((item) => {
      if (!item.title || !item.url || seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .slice(0, 4);

  return {
    analysis_version: version,
    title,
    original_language: text(data.original_language, 100),
    summary,
    key_points: keyPoints,
    mind_map: mindMap,
    mind_map_source: hasMap && data.mind_map_source !== "key_points" ? "ai" : "key_points",
    glossary,
    wiki_topics: wikiTopics,
    wiki_links: wikiLinks,
    wiki_status: ["ready", "partial", "empty", "error"].includes(data.wiki_status) ? data.wiki_status : "pending"
  };
}

function packAnalysisExtras(input) {
  const data = normalizeAnalysis(input);
  // Keep the existing JSONB column so deployed databases need no migration.
  // Version 1 stored a transcript array; version 2 stores these learning aids.
  return {
    version: ANALYSIS_VERSION,
    mind_map: data.mind_map,
    mind_map_source: data.mind_map_source,
    glossary: data.glossary,
    wiki_topics: data.wiki_topics,
    wiki_links: data.wiki_links,
    wiki_status: data.wiki_status
  };
}

function unpackAnalysisRecord(row) {
  const extras = row?.transcript;
  const isCurrent = extras && !Array.isArray(extras) && extras.version === ANALYSIS_VERSION;
  const data = normalizeAnalysis({ ...row, ...(isCurrent ? extras : {}) }, isCurrent ? ANALYSIS_VERSION : 1);
  return {
    ...data,
    id: row.id,
    youtube_url: row.youtube_url,
    video_id: row.video_id,
    created_at: row.created_at
  };
}

module.exports = { ANALYSIS_VERSION, normalizeAnalysis, packAnalysisExtras, unpackAnalysisRecord, safeWikipediaUrl };
