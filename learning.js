(() => {
  const mindMapBox = document.getElementById("mindMap");
  const mindMapStatus = document.getElementById("mindMapStatus");
  const wikiList = document.getElementById("wikiLinks");
  const wikiStatus = document.getElementById("wikiStatus");
  const wikiRetry = document.getElementById("wikiRetry");
  const tooltip = document.getElementById("learningTooltip");
  const tooltipTitle = document.getElementById("tooltipTitle");
  const tooltipText = document.getElementById("tooltipText");
  let currentData = null;
  let glossary = [];
  let tooltipAnchor = null;
  let tooltipPlacement = "above";
  let hideTimer = null;
  let edgeObserver = null;
  let edgeFrame = null;
  let wikiController = null;
  let renderVersion = 0;

  function hideTooltip() {
    clearTimeout(hideTimer);
    if (tooltipAnchor) tooltipAnchor.removeAttribute("aria-describedby");
    tooltipAnchor = null;
    tooltip.hidden = true;
  }

  function positionTooltip() {
    if (!tooltipAnchor || tooltip.hidden) return;
    const rect = tooltipAnchor.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const gap = 12;
    let left = rect.left + (rect.width - width) / 2;
    let top = rect.top - height - gap;
    if (tooltipPlacement === "side") {
      left = rect.right + gap;
      top = rect.top + (rect.height - height) / 2;
      if (left + width > viewportWidth - gap) left = rect.left - width - gap;
      if (left < gap) {
        left = rect.left + (rect.width - width) / 2;
        top = rect.bottom + gap;
      }
    } else if (top < gap) {
      top = rect.bottom + gap;
    }
    tooltip.style.left = Math.max(gap, Math.min(left, viewportWidth - width - gap)) + "px";
    tooltip.style.top = Math.max(gap, Math.min(top, viewportHeight - height - gap)) + "px";
  }

  function showTooltip(anchor, title, description, placement) {
    clearTimeout(hideTimer);
    if (tooltipAnchor && tooltipAnchor !== anchor) tooltipAnchor.removeAttribute("aria-describedby");
    tooltipAnchor = anchor;
    tooltipPlacement = placement;
    tooltipTitle.textContent = title;
    tooltipText.textContent = description;
    tooltip.hidden = false;
    anchor.setAttribute("aria-describedby", tooltip.id);
    positionTooltip();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (tooltip.matches(":hover") || document.activeElement === tooltipAnchor) return;
      hideTooltip();
    }, 160);
  }

  function explain(element, title, description, placement = "above", openOnClick = true) {
    const open = () => showTooltip(element, title, description, placement);
    element.addEventListener("mouseenter", open);
    element.addEventListener("mouseleave", scheduleHide);
    element.addEventListener("focus", open);
    element.addEventListener("blur", scheduleHide);
    if (openOnClick) element.addEventListener("click", open);
  }

  tooltip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  tooltip.addEventListener("mouseleave", scheduleHide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTooltip();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!tooltip.contains(event.target) && !tooltipAnchor?.contains(event.target)) hideTooltip();
  });
  window.addEventListener("resize", positionTooltip);
  window.addEventListener("scroll", positionTooltip, true);

  function prepare(data) {
    window.TubeNoteExplainer.prepare(data);
    renderVersion += 1;
    if (wikiController) wikiController.abort();
    hideTooltip();
    currentData = data;
    glossary = (Array.isArray(data.glossary) ? data.glossary : [])
      .filter((item) => typeof item?.term === "string" && item.term.length >= 2 && typeof item.explanation === "string")
      .sort((a, b) => b.term.length - a.term.length);
  }

  function renderText(container, value) {
    const text = typeof value === "string" ? value : "";
    container.replaceChildren();
    if (!glossary.length) {
      container.textContent = text;
      return;
    }
    const escape = (term) => term.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
    const pattern = new RegExp(glossary.map((item) => escape(item.term)).join("|"), "g");
    const terms = new Map(glossary.map((item) => [item.term, item]));
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      const term = match[0];
      const start = match.index;
      const end = start + term.length;
      // Do not turn an English name into a match inside a longer word.
      if (/^[A-Za-z0-9_]/.test(term) && /[A-Za-z0-9_]/.test(text[start - 1] || "")) continue;
      if (/[A-Za-z0-9_]$/.test(term) && /[A-Za-z0-9_]/.test(text[end] || "")) continue;
      container.append(document.createTextNode(text.slice(cursor, start)));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "glossary-term";
      button.textContent = term;
      button.setAttribute("aria-label", term + " 용어 설명");
      explain(button, term, terms.get(term).explanation);
      container.append(button);
      cursor = end;
    }
    container.append(document.createTextNode(text.slice(cursor)));
  }

  function makeMindNode(item, className) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "mind-node " + className;
    node.textContent = item.title;
    node.setAttribute("aria-label", item.title + " 자세히 이해하기");
    node.setAttribute("aria-haspopup", "dialog");
    node.setAttribute("aria-controls", "conceptDialog");
    explain(node, item.title, item.description || "추가 설명이 없습니다.", "side", false);
    node.addEventListener("click", () => {
      hideTooltip();
      window.TubeNoteExplainer.open(item);
    });
    return node;
  }

  function renderMindMap(data) {
    if (edgeObserver) edgeObserver.disconnect();
    if (edgeFrame) cancelAnimationFrame(edgeFrame);
    mindMapBox.replaceChildren();
    const map = data.mind_map;
    const branches = Array.isArray(map?.branches) ? map.branches : [];
    if (!map?.title || !branches.length) {
      mindMapStatus.textContent = "마인드맵을 만들 내용이 부족합니다. 영상을 다시 분석해 주세요.";
      return;
    }
    mindMapStatus.textContent = data.analysis_version === 1 || data.mind_map_source === "key_points"
      ? "이전 요약으로 구성한 지도입니다. 항목을 누르면 비유·예시·비교 설명을 볼 수 있습니다. 다시 분석하면 세부 개념이 추가됩니다."
      : "마우스를 올리면 짧은 설명, 클릭하면 비유·예시·비교 설명이 열립니다. 모바일 터치와 키보드 Tab/Enter도 지원합니다.";
    const canvas = document.createElement("div");
    canvas.className = "mind-canvas";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("mind-lines");
    svg.setAttribute("aria-hidden", "true");
    const rootWrap = document.createElement("div");
    rootWrap.className = "mind-root-wrap";
    const root = makeMindNode(map, "mind-root");
    rootWrap.append(root);
    const branchList = document.createElement("div");
    branchList.className = "mind-branches";
    const edges = [];
    branches.slice(0, 6).forEach((branch, index) => {
      const row = document.createElement("div");
      row.className = "mind-branch";
      row.style.setProperty("--branch-color", ["#a89bff", "#6ed8c0", "#ffc178", "#87b7ff", "#ec9bdb", "#b7d983"][index]);
      const node = makeMindNode(branch, "mind-topic");
      const leaves = document.createElement("div");
      leaves.className = "mind-leaves";
      edges.push({ from: root, to: node, color: row.style.getPropertyValue("--branch-color") });
      (Array.isArray(branch.children) ? branch.children : []).slice(0, 4).forEach((child) => {
        const leaf = makeMindNode(child, "mind-leaf");
        leaves.append(leaf);
        edges.push({ from: node, to: leaf, color: row.style.getPropertyValue("--branch-color") });
      });
      row.append(node, leaves);
      branchList.append(row);
    });
    canvas.append(svg, rootWrap, branchList);
    mindMapBox.append(canvas);

    function drawEdges() {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      svg.setAttribute("width", box.width);
      svg.setAttribute("height", box.height);
      svg.replaceChildren();
      edges.forEach(({ from, to, color }) => {
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.right - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left;
        const y2 = b.top + b.height / 2 - box.top;
        const middle = (x1 + x2) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M " + x1 + " " + y1 + " C " + middle + " " + y1 + ", " + middle + " " + y2 + ", " + x2 + " " + y2);
        path.setAttribute("stroke", color);
        svg.append(path);
      });
    }
    const scheduleEdges = () => {
      if (edgeFrame) cancelAnimationFrame(edgeFrame);
      edgeFrame = requestAnimationFrame(drawEdges);
    };
    edgeObserver = new ResizeObserver(scheduleEdges);
    edgeObserver.observe(canvas);
    scheduleEdges();
  }

  function safeWikiLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password
        && ["ko.wikipedia.org", "en.wikipedia.org"].includes(url.hostname)
        && url.pathname.startsWith("/wiki/") ? url.href : "";
    } catch { return ""; }
  }

  function renderWikiLinks(data) {
    wikiList.replaceChildren();
    (Array.isArray(data.wiki_links) ? data.wiki_links : []).forEach((item) => {
      const url = safeWikiLink(item?.url);
      if (!url) return;
      const card = document.createElement("a");
      card.className = "wiki-card";
      card.href = url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      const source = document.createElement("span");
      source.className = "wiki-source";
      source.textContent = "WIKIPEDIA · " + (item.language === "en" ? "ENGLISH" : "한국어");
      const title = document.createElement("strong");
      title.textContent = item.title || "관련 문서";
      const reason = document.createElement("p");
      reason.textContent = item.reason || "영상의 관련 개념을 자세히 살펴보세요.";
      const action = document.createElement("span");
      action.className = "wiki-open";
      action.textContent = "문서 읽기 ↗";
      card.append(source, title, reason, action);
      wikiList.append(card);
    });
    const hasLinks = wikiList.childElementCount > 0;
    if (hasLinks) {
      wikiStatus.textContent = data.wiki_status === "partial"
        ? "일부 검색이 지연되어 확인된 문서부터 표시합니다."
        : "영상의 주요 개념을 더 알아볼 수 있는 위키피디아 문서입니다.";
    } else if (data.wiki_status === "error") {
      wikiStatus.textContent = "위키피디아에 연결하지 못했습니다. 잠시 후 다시 찾아보세요.";
    } else if (data.analysis_version === 1) {
      wikiStatus.textContent = "이전 기록입니다. 영상을 다시 분석하면 관련 문서를 추천합니다.";
    } else {
      wikiStatus.textContent = "관련 문서를 찾지 못했습니다.";
    }
    wikiRetry.classList.toggle("hidden", !["error", "partial"].includes(data.wiki_status));
  }

  async function loadWikipedia(data) {
    const version = renderVersion;
    const topics = Array.isArray(data.wiki_topics) ? data.wiki_topics.slice(0, 4) : [];
    if (!topics.length) {
      renderWikiLinks(data);
      return;
    }
    if (wikiController) wikiController.abort();
    const controller = new AbortController();
    wikiController = controller;
    const timeout = setTimeout(() => controller.abort(), 28000);
    wikiStatus.textContent = "관련 위키피디아 문서를 찾고 있습니다…";
    wikiRetry.disabled = true;
    wikiRetry.classList.add("hidden");
    try {
      const response = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Wikipedia search failed");
      if (version !== renderVersion || currentData !== data) return;
      data.wiki_links = Array.isArray(payload.links) ? payload.links : [];
      data.wiki_status = payload.status || "empty";
      renderWikiLinks(data);
    } catch {
      if (version !== renderVersion || currentData !== data) return;
      data.wiki_status = "error";
      renderWikiLinks(data);
    } finally {
      clearTimeout(timeout);
      if (version === renderVersion) {
        wikiRetry.disabled = false;
        wikiController = null;
      }
    }
  }

  function renderExtras(data) {
    renderMindMap(data);
    renderWikiLinks(data);
    if (!data.wiki_links?.length && data.wiki_status !== "empty") loadWikipedia(data);
  }

  wikiRetry.addEventListener("click", () => {
    if (currentData) loadWikipedia(currentData);
  });
  window.TubeNoteLearning = { prepare, renderText, renderExtras };
})();
