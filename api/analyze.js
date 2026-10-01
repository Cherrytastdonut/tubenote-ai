const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

function extractVideoId(value) {
  try {
    const url = new URL(String(value || "").trim());
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

function getOutputText(interaction) {
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;

    const textPart = step.content.find(
      (part) => part?.type === "text" && typeof part.text === "string"
    );

    if (textPart) return textPart.text;
  }

  return "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!apiKey) {
    return res.status(500).json({
      error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
    }
  }

  const videoId = extractVideoId(body?.youtubeUrl);
  if (!videoId) {
    return res.status(400).json({
      error: "올바른 공개 YouTube 영상 URL을 입력해 주세요."
    });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const responseSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "영상에서 확인할 수 있는 제목. 확실하지 않으면 간단한 주제 제목."
      },
      original_language: {
        type: "string",
        description: "영상에서 주로 사용된 언어의 한국어 이름."
      },
      summary: {
        type: "string",
        description: "영상 전체 내용을 3~5문장으로 정리한 한국어 요약."
      },
      key_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: {
              type: "string",
              description: "해당 내용이 등장하는 대략적인 MM:SS 또는 HH:MM:SS."
            },
            point: {
              type: "string",
              description: "핵심 내용을 한국어 한 문장으로 정리."
            }
          },
          required: ["timestamp", "point"]
        }
      },
      transcript: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: {
              type: "string",
              description: "발화가 시작되는 대략적인 MM:SS 또는 HH:MM:SS."
            },
            text: {
              type: "string",
              description: "해당 구간의 실제 발화 내용을 가능한 한 원문 언어 그대로 기록."
            }
          },
          required: ["timestamp", "text"]
        }
      }
    },
    required: ["title", "original_language", "summary", "key_points", "transcript"]
  };

  const prompt = [
    "이 공개 YouTube 영상을 분석하세요.",
    "1) 영상 전체의 핵심 내용을 한국어로 3~5문장 요약하세요.",
    "2) 중요한 내용을 시간순 핵심 포인트 5~8개로 정리하고 각 항목에 대략적인 타임스탬프를 붙이세요.",
    "3) 영상에서 들리는 발화를 시간순으로 자막형 텍스트로 정리하세요.",
    "4) 자막형 텍스트는 번역하지 말고 원래 발화 언어를 최대한 유지하세요.",
    "5) 실제로 들리지 않는 말을 만들어내지 마세요. 불명확한 구간은 [불명확]으로 표시하거나 생략하세요.",
    "6) 음악만 있거나 발화가 없는 구간은 억지로 자막을 만들지 마세요.",
    "7) 결과는 제공된 JSON 스키마에만 맞춰 반환하세요."
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model,
        input: [
          { type: "video", uri: youtubeUrl },
          { type: "text", text: prompt }
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: responseSchema
        }
      }),
      signal: controller.signal
    });

    const raw = await geminiResponse.json().catch(() => null);

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", raw);
      const detail =
        raw?.error?.message ||
        "Gemini API 요청에 실패했습니다. 공개 영상인지와 API 설정을 확인해 주세요.";
      return res.status(geminiResponse.status >= 500 ? 502 : 400).json({ error: detail });
    }

    if (raw?.status && raw.status !== "completed") {
      console.error("Gemini interaction incomplete:", raw);
      return res.status(502).json({
        error: "Gemini 분석이 정상적으로 완료되지 않았습니다. 다른 영상으로 다시 시도해 주세요."
      });
    }

    const outputText = getOutputText(raw);
    if (!outputText) {
      console.error("Gemini response without text:", raw);
      return res.status(502).json({ error: "Gemini 응답에서 분석 결과를 찾지 못했습니다." });
    }

    let data;
    try {
      data = JSON.parse(outputText);
    } catch {
      console.error("Invalid Gemini JSON:", outputText);
      return res.status(502).json({ error: "Gemini 분석 결과 형식을 읽지 못했습니다." });
    }

    return res.status(200).json({
      videoId,
      youtubeUrl,
      model,
      data
    });
  } catch (error) {
    console.error("Analyze error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "영상 분석 시간이 너무 길어 요청이 종료되었습니다. 더 짧은 영상으로 테스트해 주세요."
      });
    }

    return res.status(500).json({
      error: "서버에서 영상 분석 중 오류가 발생했습니다."
    });
  } finally {
    clearTimeout(timeout);
  }
};
