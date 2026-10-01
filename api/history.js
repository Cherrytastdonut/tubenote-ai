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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  try {
    const { url, key } = getSupabaseConfig();

    const params = new URLSearchParams({
      select: "id,youtube_url,video_id,title,original_language,summary,key_points,transcript,created_at",
      order: "created_at.desc",
      limit: "20"
    });

    const response = await fetch(
      `${url}/rest/v1/video_analyses?${params.toString()}`,
      {
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`
        }
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase history error:", payload);
      return res.status(502).json({
        error: payload?.message || "Supabase 저장 기록을 불러오지 못했습니다."
      });
    }

    return res.status(200).json({
      data: Array.isArray(payload) ? payload : []
    });
  } catch (error) {
    console.error("History API error:", error);
    return res.status(500).json({
      error: error?.message || "저장 기록 조회 중 서버 오류가 발생했습니다."
    });
  }
};
