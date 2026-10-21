(() => {
  const dialog = document.getElementById("conceptDialog");
  const title = document.getElementById("conceptTitle");
  const context = document.getElementById("conceptContext");
  const status = document.getElementById("conceptStatus");
  const retry = document.getElementById("conceptRetry");
  const body = document.getElementById("conceptBody");
  const overview = document.getElementById("conceptOverview");
  const recommendation = document.getElementById("conceptRecommendation");
  const tabs = Array.from(document.querySelectorAll("#conceptTabs [role=tab]"));
  const labels = { analogy: "비유로 이해", example: "예시 따라가기", comparison: "나란히 비교" };
  const panels = Object.fromEntries(Object.keys(labels).map((mode) => [mode, document.getElementById("panel-" + mode)]));
  let currentData = null;
  let selected = null;
  let controller = null;
  let requestVersion = 0;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function key(node) {
    return JSON.stringify([node.title.trim(), node.description.trim()]);
  }
  function entryKey(entry) {
    return JSON.stringify([entry?.concept_title, entry?.concept_description]);
  }
  function clearRequest() {
    requestVersion += 1;
    if (controller) controller.abort();
    controller = null;
    status.removeAttribute("data-loading");
    body.removeAttribute("aria-busy");
  }
  function cancel() {
    clearRequest();
    if (dialog.open) dialog.close();
  }
  function prepare(data) {
    cancel();
    currentData = data;
    selected = null;
  }

  document.getElementById("conceptClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", clearRequest);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      dialog.close();
    }
  });

  function table(caption, headings, rows, rowHeadings = false) {
    const wrap = element("div", undefined, "explain-table-wrap");
    const node = element("table", undefined, "explain-table");
    node.append(element("caption", caption));
    const head = element("thead");
    const headerRow = element("tr");
    headings.forEach((label) => {
      const th = element("th", label);
      th.scope = "col";
      headerRow.append(th);
    });
    head.append(headerRow);
    const tbody = element("tbody");
    rows.forEach((cells) => {
      const row = element("tr");
      cells.forEach((value, index) => {
        const isHeader = rowHeadings && index === 0;
        const cell = element(isHeader ? "th" : "td", value);
        if (isHeader) cell.scope = "row";
        row.append(cell);
      });
      tbody.append(row);
    });
    node.append(head, tbody);
    wrap.append(node);
    return wrap;
  }
  function callout(label, value) {
    const box = element("div", undefined, "explain-callout");
    box.append(element("strong", label), element("p", value));
    return box;
  }
  function unavailable(panel, mode) {
    if (mode.available) return false;
    panel.append(callout("다른 방식으로 이해해 보세요", mode.reason));
    return true;
  }
  function renderAnalogy(mode) {
    const panel = panels.analogy;
    panel.replaceChildren();
    if (unavailable(panel, mode)) return;
    panel.append(element("h3", "익숙한 장면으로 연결하기"));
    const story = element("div", undefined, "explain-story");
    story.append(element("p", mode.scenario));
    panel.append(story, table("비유와 실제 개념의 연결", ["비유 속 요소", "실제 개념"],
      mode.mappings.map((row) => [row.familiar, row.concept])), callout("비유가 실제와 달라지는 지점", mode.limit));
  }
  function renderExample(mode) {
    const panel = panels.example;
    panel.replaceChildren();
    if (unavailable(panel, mode)) return;
    panel.append(element("h3", mode.title), element("p", mode.setup));
    const progress = element("nav", undefined, "explain-steps");
    progress.setAttribute("aria-label", "예시 단계 선택");
    const stage = element("div", undefined, "explain-step-card");
    const controls = element("div", undefined, "explain-step-controls");
    const previous = element("button", "이전", "secondary-button");
    const next = element("button", "다음", "primary-action");
    previous.type = next.type = "button";
    const count = element("span", "", "explain-step-count");
    count.setAttribute("role", "status");
    count.setAttribute("aria-live", "polite");
    const outcome = callout("이 예시에서 알 수 있는 것", mode.result);
    let stepIndex = 0;
    const stepButtons = mode.steps.map((step, index) => {
      const button = element("button", String(index + 1));
      button.type = "button";
      button.setAttribute("aria-label", (index + 1) + "단계: " + step.title);
      button.addEventListener("click", () => showStep(index));
      progress.append(button);
      return button;
    });
    function showStep(index) {
      stepIndex = Math.max(0, Math.min(index, mode.steps.length - 1));
      const step = mode.steps[stepIndex];
      stage.replaceChildren(element("h4", step.title), element("p", step.detail));
      const why = element("div", undefined, "explain-step-why");
      why.append(element("strong", "왜 이렇게 되나요?"), element("p", step.why));
      stage.append(why);
      stepButtons.forEach((button, i) => {
        if (i === stepIndex) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
      previous.disabled = stepIndex === 0;
      next.disabled = stepIndex === mode.steps.length - 1;
      count.textContent = (stepIndex + 1) + " / " + mode.steps.length + " 단계";
      outcome.hidden = stepIndex !== mode.steps.length - 1;
    }
    previous.addEventListener("click", () => showStep(stepIndex - 1));
    next.addEventListener("click", () => showStep(stepIndex + 1));
    controls.append(previous, count, next);
    panel.append(progress, stage, controls, outcome);
    showStep(0);
  }
  function renderComparison(mode) {
    const panel = panels.comparison;
    panel.replaceChildren();
    if (unavailable(panel, mode)) return;
    panel.append(element("h3", mode.left + " · " + mode.right),
      callout("먼저, 공통점", mode.shared),
      table("같은 기준으로 비교하기", ["비교 기준", mode.left, mode.right],
        mode.rows.map((row) => [row.criterion, row.left, row.right]), true),
      callout("이렇게 구별해 보세요", mode.takeaway));
  }
  function selectMode(mode, moveFocus = false) {
    if (!panels[mode]) return;
    tabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[tab.dataset.mode].hidden = !active;
      if (active && moveFocus) tab.focus();
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectMode(tabs[next].dataset.mode, true);
    });
  });

  function render(result) {
    overview.textContent = result.overview;
    recommendation.textContent = "추천 · " + labels[result.recommended_mode]
      + (result.recommendation_reason ? " — " + result.recommendation_reason : "");
    tabs.forEach((tab) => {
      tab.replaceChildren(document.createTextNode(labels[tab.dataset.mode]));
      if (tab.dataset.mode === result.recommended_mode) tab.append(element("span", "추천", "explain-badge"));
    });
    renderAnalogy(result.analogy);
    renderExample(result.example);
    renderComparison(result.comparison);
    selectMode(result.recommended_mode);
    status.textContent = "";
    retry.hidden = true;
    body.hidden = false;
  }

  async function loadExplanation() {
    if (!currentData || !selected) return;
    clearRequest();
    const version = requestVersion;
    const data = currentData;
    const concept = selected;
    body.hidden = true;
    retry.hidden = true;
    status.className = "status";
    status.textContent = "이 개념에 맞는 비유·예시·비교 설명을 만들고 있습니다…";
    status.dataset.loading = "true";
    body.setAttribute("aria-busy", "true");
    const requestController = new AbortController();
    controller = requestController;
    const timeout = setTimeout(() => requestController.abort(), 60000);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          data: { title: data.title, summary: data.summary, key_points: data.key_points, mind_map: data.mind_map }
        }),
        signal: requestController.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "설명을 불러오지 못했습니다.");
      if (version !== requestVersion || currentData !== data || !dialog.open) return;
      const result = payload.explanation;
      if (result?.version !== 1 || entryKey(result) !== key(concept) || !result.overview
          || !labels[result.recommended_mode] || !result.analogy || !result.example || !result.comparison) {
        throw new Error("설명 결과를 읽지 못했습니다. 다시 시도해 주세요.");
      }
      const entries = Array.isArray(data.concept_explanations) ? data.concept_explanations : [];
      data.concept_explanations = [result, ...entries.filter((entry) => entryKey(entry) !== key(concept))].slice(0, 12);
      render(result);
    } catch (error) {
      if (version !== requestVersion || currentData !== data || !dialog.open) return;
      status.className = "status error";
      status.textContent = error?.name === "AbortError"
        ? "설명 생성이 지연되고 있습니다. 다시 시도해 주세요."
        : error.message || "설명을 불러오지 못했습니다.";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (version === requestVersion) {
        controller = null;
        status.removeAttribute("data-loading");
        body.removeAttribute("aria-busy");
      }
    }
  }

  function open(node) {
    if (!currentData || typeof node?.title !== "string" || typeof node?.description !== "string" || !node.description) return;
    clearRequest();
    selected = { title: node.title.trim(), description: node.description.trim() };
    title.textContent = selected.title;
    context.textContent = selected.description;
    context.parentElement.open = false;
    status.textContent = "";
    body.hidden = true;
    retry.hidden = true;
    const entries = Array.isArray(currentData.concept_explanations) ? currentData.concept_explanations : [];
    const cached = entries.find((entry) => entry?.version === 1 && entryKey(entry) === key(selected));
    if (!dialog.open) dialog.showModal();
    title.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    if (cached) render(cached);
    else loadExplanation();
  }

  retry.addEventListener("click", loadExplanation);
  window.TubeNoteExplainer = { prepare, open, cancel };
})();
