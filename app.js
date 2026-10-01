const form = document.getElementById("analyzeForm");
const urlInput = document.getElementById("youtubeUrl");
const analyzeButton = document.getElementById("analyzeButton");
const statusBox = document.getElementById("status");
const resultSection = document.getElementById("resultSection");
const videoFrame = document.getElementById("videoFrame");
const videoTitle = document.getElementById("videoTitle");
const videoLanguage = document.getElementById("videoLanguage");
const summaryBox = document.getElementById("summary");
const keyPointsBox = document.getElementById("keyPoints");
const transcriptBox = document.getElementById("transcript");
const copyTranscriptButton = document.getElementById("copyTranscript");
const saveAnalysisButton = document.getElementById("saveAnalysis");
const saveStatus = document.getElementById("saveStatus");
const refreshHistoryButton = document.getElementById("refreshHistory");
const historyStatus = document.getElementById("historyStatus");
const historyList = document.getElementById("historyList");

let currentTranscript = [];
let currentAnalysis = null;
let currentVideoId = null;
let currentYoutubeUrl = null;

function getVideoId(value) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v") || "";
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function canonicalUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  analyzeButton.classList.toggle("loading", isLoading);
  urlInput.disabled = isLoading;
}

function renderResult(data, videoId, youtubeUrl = canonicalUrl(videoId)) {
  currentAnalysis = data;
  currentVideoId = videoId;
  currentYoutubeUrl = youtubeUrl;
  saveAnalysisButton.disabled = false;
  saveStatus.textContent = "";
  saveStatus.className = "status";

  videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
  videoTitle.textContent = data.title || "제목을 확인하지 못했습니다.";
  videoLanguage.textContent = data.original_language
    ? `감지 언어: ${data.original_language}`
    : "";
  summaryBox.textContent = data.summary || "요약 결과가 없습니다.";

  keyPointsBox.replaceChildren();
  const points = Array.isArray(data.key_points) ? data.key_points : [];
  points.forEach((item) => {
    const row = document.createElement("div");
    row.className = "point";

    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = item.timestamp || "--:--";

    const text = document.createElement("p");
    text.textContent = item.point || "";

    row.append(time, text);
    keyPointsBox.append(row);
  });

  transcriptBox.replaceChildren();
  currentTranscript = Array.isArray(data.transcript) ? data.transcript : [];
  currentTranscript.forEach((item) => {
    const row = document.createElement("div");
    row.className = "transcript-line";

    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = item.timestamp || "--:--";

    const text = document.createElement("p");
    text.textContent = item.text || "";

    row.append(time, text);
    transcriptBox.append(row);
  });

  if (!currentTranscript.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "음성 자막형 텍스트를 생성하지 못했습니다.";
    transcriptBox.append(empty);
  }

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const videoId = getVideoId(urlInput.value);
  if (!videoId) {
    setStatus("올바른 YouTube 영상 URL을 입력해 주세요.", "error");
    return;
  }

  const youtubeUrl = canonicalUrl(videoId);
  setLoading(true);
  resultSection.classList.add("hidden");
  setStatus("Gemini가 영상을 분석하고 있습니다. 영상 길이에 따라 시간이 걸릴 수 있습니다.");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "영상 분석에 실패했습니다.");
    }

    renderResult(payload.data, videoId, youtubeUrl);
    setStatus("분석이 완료되었습니다.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "잠시 후 다시 시도해 주세요.", "error");
  } finally {
    setLoading(false);
  }
});

copyTranscriptButton.addEventListener("click", async () => {
  if (!currentTranscript.length) return;

  const text = currentTranscript
    .map((item) => `[${item.timestamp || "--:--"}] ${item.text || ""}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    copyTranscriptButton.textContent = "복사됨";
    setTimeout(() => {
      copyTranscriptButton.textContent = "복사";
    }, 1400);
  } catch {
    setStatus("브라우저에서 복사 기능을 사용할 수 없습니다.", "error");
  }
});


saveAnalysisButton.disabled = true;

saveAnalysisButton.addEventListener("click", async () => {
  if (!currentAnalysis || !currentVideoId || !currentYoutubeUrl) {
    saveStatus.textContent = "먼저 영상을 분석해 주세요.";
    saveStatus.className = "status error";
    return;
  }

  saveAnalysisButton.disabled = true;
  saveStatus.textContent = "Supabase에 저장 중입니다...";
  saveStatus.className = "status";

  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: currentVideoId,
        youtubeUrl: currentYoutubeUrl,
        data: currentAnalysis
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && payload.code === "DUPLICATE") {
        throw new Error("이미 저장된 영상입니다.");
      }
      throw new Error(payload.error || "저장에 실패했습니다.");
    }

    saveStatus.textContent = "Supabase에 저장되었습니다.";
    saveStatus.className = "status success";
    await loadHistory();
  } catch (error) {
    console.error(error);
    saveStatus.textContent = error.message || "저장 중 오류가 발생했습니다.";
    saveStatus.className = "status error";
  } finally {
    saveAnalysisButton.disabled = false;
  }
});

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function renderHistory(items) {
  historyList.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "아직 저장된 분석 기록이 없습니다.";
    historyList.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "history-main";

    const textWrap = document.createElement("div");

    const title = document.createElement("p");
    title.className = "history-title";
    title.textContent = item.title || "제목 없음";

    const meta = document.createElement("p");
    meta.className = "history-meta";
    meta.textContent = `${formatDate(item.created_at)} · ${item.original_language || "언어 미상"}`;

    const open = document.createElement("span");
    open.className = "history-open";
    open.textContent = "열기";

    textWrap.append(title, meta);
    openButton.append(textWrap, open);

    openButton.addEventListener("click", () => {
      urlInput.value = item.youtube_url || "";
      renderResult(
        {
          title: item.title,
          original_language: item.original_language,
          summary: item.summary,
          key_points: item.key_points,
          transcript: item.transcript
        },
        item.video_id,
        item.youtube_url
      );
      setStatus("저장된 분석 기록을 불러왔습니다.", "success");
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete";
    deleteButton.textContent = "삭제";

    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm("이 저장 기록을 삭제하시겠습니까?");
      if (!confirmed) return;

      deleteButton.disabled = true;
      deleteButton.textContent = "삭제 중";

      try {
        const response = await fetch("/api/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "삭제에 실패했습니다.");
        }

        historyStatus.textContent = "저장 기록이 삭제되었습니다.";
        historyStatus.className = "status success";
        await loadHistory();
      } catch (error) {
        console.error(error);
        historyStatus.textContent = error.message || "삭제 중 오류가 발생했습니다.";
        historyStatus.className = "status error";
        deleteButton.disabled = false;
        deleteButton.textContent = "삭제";
      }
    });

    row.append(openButton, deleteButton);
    historyList.append(row);
  });
}

async function loadHistory() {
  historyStatus.textContent = "저장 기록을 불러오는 중입니다...";
  historyStatus.className = "status";

  try {
    const response = await fetch("/api/history");
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "저장 기록을 불러오지 못했습니다.");
    }

    renderHistory(Array.isArray(payload.data) ? payload.data : []);
    historyStatus.textContent = "";
  } catch (error) {
    console.error(error);
    historyStatus.textContent = error.message || "저장 기록 조회 중 오류가 발생했습니다.";
    historyStatus.className = "status error";
  }
}

refreshHistoryButton.addEventListener("click", loadHistory);
loadHistory();
