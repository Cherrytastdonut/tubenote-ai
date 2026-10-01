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

let currentTranscript = [];

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

function renderResult(data, videoId) {
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

    renderResult(payload.data, videoId);
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
