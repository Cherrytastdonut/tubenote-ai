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

function supabaseHeaders(key, extra = {}) {
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    ...extra
  };
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

    // 같은 YouTube 영상이 이미 저장되어 있는지 먼저 확인합니다.
    const checkParams = new URLSearchParams({
      select: "id,title,created_at",
      video_id: `eq.${videoId}`,
      limit: "1"
    });

    const checkResponse = await fetch(
      `${url}/rest/v1/video_analyses?${checkParams.toString()}`,
      { headers: supabaseHeaders(key) }
    );

    const existing = await checkResponse.json().catch(() => null);

    if (!checkResponse.ok) {
      console.error("Supabase duplicate check error:", existing);
      return res.status(502).json({
        error: existing?.message || "중복 저장 여부를 확인하지 못했습니다."
      });
    }

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        code: "DUPLICATE",
        error: "이미 저장된 영상입니다.",
        existing: existing[0]
      });
    }

    const response = await fetch(`${url}/rest/v1/video_analyses`, {
      method: "POST",
      headers: supabaseHeaders(key, {
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }),
      body: JSON.stringify(record)
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase save error:", payload);

      // UNIQUE 인덱스가 동시에 발생한 중복 저장도 최종적으로 차단합니다.
      if (payload?.code === "23505") {
        return res.status(409).json({
          code: "DUPLICATE",
          error: "이미 저장된 영상입니다."
        });
      }

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
