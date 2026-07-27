/**
 * نجد — Cloudflare Worker
 * يخدم ملفات التطبيق الثابتة (HTML/CSS/JS) بدون R2.
 * النشر: wrangler deploy  (مع [assets] directory = "./public/app")
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // فحص الصحة
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: "najd", time: Date.now() });
    }
    // ملفات ثابتة عبر Workers Assets (بدون R2)
    if (env.ASSETS) {
      let res = await env.ASSETS.fetch(request);
      if (res.status === 404) {
        // SPA fallback
        res = await env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
      }
      const out = new Response(res.body, res);
      out.headers.set("X-Content-Type-Options", "nosniff");
      out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      out.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
      return out;
    }
    return new Response("Assets binding not configured", { status: 500 });
  },
};
