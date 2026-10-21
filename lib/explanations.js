const MODES = ["analogy", "example", "comparison"];

function text(value, limit = 800) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function list(value, limit, mapper) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map(mapper);
}
function conceptIdentity(value) {
  return { title: text(value?.title, 500), description: text(value?.description, 12000) };
}
function conceptKey(value) {
  const node = conceptIdentity(value);
  return JSON.stringify([node.title, node.description]);
}
function conceptNodes(map) {
  if (!map || typeof map !== "object") return [];
  return [map, ...list(map.branches, 6, (branch) => [branch, ...list(branch?.children, 4, (child) => child)]).flat()]
    .map(conceptIdentity).filter((node) => node.title && node.description);
}

function normalizeExplanation(input, identity) {
  if (!input || typeof input !== "object") return null;
  const node = conceptIdentity(identity || { title: input.concept_title, description: input.concept_description });
  if (!node.title || !node.description) return null;
  const a = input.analogy || {};
  const e = input.example || {};
  const c = input.comparison || {};
  const analogy = {
    available: a.available === true,
    reason: text(a.reason, 400),
    scenario: text(a.scenario, 1800),
    mappings: list(a.mappings, 4, (row) => ({ familiar: text(row?.familiar, 400), concept: text(row?.concept, 400) }))
      .filter((row) => row.familiar && row.concept),
    limit: text(a.limit, 800)
  };
  analogy.available = Boolean(analogy.available && analogy.scenario && analogy.mappings.length >= 2 && analogy.limit);
  const example = {
    available: e.available === true,
    reason: text(e.reason, 400),
    title: text(e.title, 160),
    setup: text(e.setup, 1200),
    steps: list(e.steps, 5, (step) => ({
      title: text(step?.title, 120), detail: text(step?.detail, 1000), why: text(step?.why, 600)
    })).filter((step) => step.title && step.detail && step.why),
    result: text(e.result, 1000)
  };
  example.available = Boolean(example.available && example.title && example.setup && example.steps.length >= 2 && example.result);
  const comparison = {
    available: c.available === true,
    reason: text(c.reason, 400),
    left: text(c.left, 160),
    right: text(c.right, 160),
    shared: text(c.shared, 800),
    rows: list(c.rows, 5, (row) => ({
      criterion: text(row?.criterion, 120), left: text(row?.left, 600), right: text(row?.right, 600)
    })).filter((row) => row.criterion && row.left && row.right),
    takeaway: text(c.takeaway, 1000)
  };
  comparison.available = Boolean(comparison.available && comparison.left && comparison.right
    && comparison.left !== comparison.right && comparison.shared && comparison.rows.length >= 2 && comparison.takeaway);
  const modes = { analogy, example, comparison };
  const available = MODES.filter((mode) => modes[mode].available);
  const overview = text(input.overview, 1000);
  if (!available.length || !overview) return null;
  const recommended = available.includes(input.recommended_mode) ? input.recommended_mode : available[0];
  for (const mode of MODES) {
    if (!modes[mode].available && !modes[mode].reason) {
      modes[mode].reason = "이 개념에 맞는 설명을 충분히 구성하지 못했습니다. 다른 설명 방식을 확인해 주세요.";
    }
  }
  return {
    version: 1, concept_title: node.title, concept_description: node.description,
    overview, recommended_mode: recommended, recommendation_reason: text(input.recommendation_reason, 500),
    ...modes
  };
}

function normalizeExplanationCache(input, map) {
  const nodes = new Map(conceptNodes(map).map((node) => [conceptKey(node), node]));
  const seen = new Set();
  return list(input, 12, (entry) => {
    if (entry?.version !== 1) return null;
    const key = conceptKey({ title: entry.concept_title, description: entry.concept_description });
    if (!nodes.has(key) || seen.has(key)) return null;
    const normalized = normalizeExplanation(entry, nodes.get(key));
    if (normalized) seen.add(key);
    return normalized;
  }).filter(Boolean);
}

const string = { type: "string" };
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties) });
const array = (properties) => ({ type: "array", items: object(properties) });
const common = { available: { type: "boolean" }, reason: string };
const responseSchema = object({
  overview: string,
  recommended_mode: { type: "string", enum: MODES },
  recommendation_reason: string,
  analogy: object({
    ...common, scenario: string,
    mappings: array({ familiar: string, concept: string }),
    limit: string
  }),
  example: object({
    ...common, title: string, setup: string,
    steps: array({ title: string, detail: string, why: string }),
    result: string
  }),
  comparison: object({
    ...common, left: string, right: string, shared: string,
    rows: array({ criterion: string, left: string, right: string }),
    takeaway: string
  })
});

module.exports = { MODES, conceptIdentity, conceptKey, conceptNodes, normalizeExplanation, normalizeExplanationCache, responseSchema };
