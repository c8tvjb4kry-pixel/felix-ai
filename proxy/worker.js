// Felix AI proxy: meneruskan chat ke Groq dengan key dari secret GROQ_API_KEY.
const UPSTREAM = "https://api.groq.com/openai/v1/chat/completions";
const ALLOWED_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const MAX_TOKENS = 2048;
const MAX_BODY = 8000000; // byte (foto terkompresi dari klien)
const VISION_MODELS = ["qwen/qwen3.8-27b"];
const MAX_IMAGES = 5; // batas Groq per permintaan
const MAX_IMAGE_URL = 4000000; // batas Groq untuk gambar base64
const MAX_MESSAGES = 50;
const PASS = ["temperature", "top_p", "seed", "stop", "reasoning_effort", "include_reasoning", "reasoning_format"];

function originOk(o) {
  return o === "https://c8tvjb4kry-pixel.github.io" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || "");
}
function cors(o) {
  return originOk(o) ? {
    "Access-Control-Allow-Origin": o, "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400"
  } : { "Vary": "Origin" };
}
function err(status, msg, o) {
  return new Response(JSON.stringify({ error: { message: msg } }), { status, headers: { "Content-Type": "application/json", ...cors(o) } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), o = req.headers.get("Origin");
    if (req.method === "OPTIONS") return new Response(null, { status: originOk(o) ? 204 : 403, headers: cors(o) });
    if (url.pathname !== "/v1/chat/completions") return err(404, "Not found", o);
    if (req.method !== "POST") return err(405, "Method not allowed", o);
    if (!originOk(o)) return err(403, "Origin not allowed", o);
    if (!env.GROQ_API_KEY) return err(500, "Server not configured", o);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return err(413, "Request too large", o);
    let b; try { b = JSON.parse(raw); } catch { return err(400, "Invalid JSON", o); }
    if (!ALLOWED_MODELS.includes(b.model)) return err(400, "Model not allowed", o);
    if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > MAX_MESSAGES) return err(400, "Invalid messages", o);
    let images = 0;
    for (const m of b.messages) {
      if (!m || typeof m !== "object" || !["system", "user", "assistant"].includes(m.role)) return err(400, "Invalid messages", o);
      if (typeof m.content === "string") continue;
      if (!Array.isArray(m.content) || m.role !== "user") return err(400, "Invalid messages", o);
      for (const p of m.content) {
        if (p && p.type === "text" && typeof p.text === "string") continue;
        const u = p && p.type === "image_url" && p.image_url && p.image_url.url;
        if (typeof u !== "string" || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(u) || u.length > MAX_IMAGE_URL) return err(400, "Invalid image", o);
        images++;
      }
    }
    if (images > MAX_IMAGES) return err(400, "Too many images", o);
    if (images && !VISION_MODELS.includes(b.model)) return err(400, "Model does not support images", o);
    const body = { model: b.model, messages: b.messages, stream: !!b.stream };
    for (const k of PASS) if (b[k] !== undefined) body[k] = b[k];
    const req_max = parseInt(b.max_completion_tokens || b.max_tokens, 10);
    body.max_completion_tokens = req_max > 0 ? Math.min(req_max, MAX_TOKENS) : MAX_TOKENS;
    const up = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.GROQ_API_KEY },
      body: JSON.stringify(body)
    });
    const h = new Headers(cors(o));
    for (const k of ["content-type", "retry-after", "cache-control"]) { const v = up.headers.get(k); if (v) h.set(k, v); }
    return new Response(up.body, { status: up.status, headers: h });
  }
};
