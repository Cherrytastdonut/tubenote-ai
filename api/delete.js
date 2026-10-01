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

function validUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "DELETE 요청만 지원합니다." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
    }
  }

  const id = body?.id;
  if (!validUuid(id)) {
    return res.status(400).json({ error: "삭제할 기록 ID가 올바르지 않습니다." });
  }

  try {
    const { url, key } = getSupabaseConfig();
    const params = new URLSearchParams({ id: `eq.${id}` });

    const response = await fetch(
      `${url}/rest/v1/video_analyses?${params.toString()}`,
      {
        method: "DELETE",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Prefer": "return=representation"
        }
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase delete error:", payload);
      return res.status(502).json({
        error: payload?.message || "저장 기록을 삭제하지 못했습니다."
      });
    }

    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(404).json({ error: "삭제할 기록을 찾지 못했습니다." });
    }

    return res.status(200).json({
      message: "저장 기록이 삭제되었습니다.",
      data: payload[0]
    });
  } catch (error) {
    console.error("Delete API error:", error);
    return res.status(500).json({
      error: error?.message || "삭제 중 서버 오류가 발생했습니다."
    });
  }
};
