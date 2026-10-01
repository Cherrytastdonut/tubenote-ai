function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase 서버 환경 변수가 설정되지 않았습니다.");
  }

  return {
    url: url.replace(/\/$/, ""),
    key
  };
}

function validVideoId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
    }
  }

  const videoId = body?.videoId;
  const youtubeUrl = body?.youtubeUrl;
  const data = body?.data;

  if (!validVideoId(videoId) || typeof youtubeUrl !== "string" || !data) {
    return res.status(400).json({ error: "저장할 분석 결과가 올바르지 않습니다." });
  }

  const record = {
    youtube_url: youtubeUrl.slice(0, 500),
    video_id: videoId,
    title: String(data.title || "").slice(0, 500),
    original_language: String(data.original_language || "").slice(0, 100),
    summary: String(data.summary || ""),
    key_points: Array.isArray(data.key_points) ? data.key_points : [],
    transcript: Array.isArray(data.transcript) ? data.transcript : []
  };

  try {
    const { url, key } = getSupabaseConfig();

    const response = await fetch(`${url}/rest/v1/video_analyses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(record)
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase save error:", payload);
      return res.status(502).json({
        error: payload?.message || "Supabase에 분석 결과를 저장하지 못했습니다."
      });
    }

    const saved = Array.isArray(payload) ? payload[0] : payload;
    return res.status(201).json({ data: saved });
  } catch (error) {
    console.error("Save API error:", error);
    return res.status(500).json({
      error: error?.message || "저장 중 서버 오류가 발생했습니다."
    });
  }
};
