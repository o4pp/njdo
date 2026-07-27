import { ChatRoom } from "./durable-objects/ChatRoom.js";

export { ChatRoom };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Register
      if (path === "/api/auth/register" && request.method === "POST") {
        const { username, password, display_name } = await request.json();
        const id = crypto.randomUUID();
        const password_hash = btoa(password);

        await env.DB.prepare(
          "INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)"
        ).bind(id, username, password_hash, display_name).run();

        return Response.json({ success: true, userId: id }, { headers: corsHeaders });
      }

      // Login
      if (path === "/api/auth/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const password_hash = btoa(password);

        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? AND password_hash = ?"
        ).bind(username, password_hash).first();

        if (!user) {
          return Response.json({ success: false, message: "بيانات الدخول غير صحيحة" }, { status: 401, headers: corsHeaders });
        }

        return Response.json({ success: true, token: user.id, user }, { headers: corsHeaders });
      }

      // Get Stories
      if (path === "/api/stories" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT s.*, u.username, u.display_name, u.avatar_url FROM stories s JOIN users u ON s.user_id = u.id WHERE s.expires_at > datetime('now') ORDER BY s.created_at DESC"
        ).all();
        return Response.json({ success: true, stories: results }, { headers: corsHeaders });
      }

      // Post Story
      if (path === "/api/stories" && request.method === "POST") {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader) return Response.json({ success: false, message: "غير مرخص" }, { status: 401, headers: corsHeaders });
        
        const userId = authHeader.replace("Bearer ", "");
        const { media_url, media_type, caption } = await request.json();
        const id = crypto.randomUUID();
        
        await env.DB.prepare(
          "INSERT INTO stories (id, user_id, media_url, media_type, caption, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 day'))"
        ).bind(id, userId, media_url, media_type, caption || "").run();

        return Response.json({ success: true, storyId: id }, { headers: corsHeaders });
      }

      // Durable Object Chat WebSocket Router
      if (path.startsWith("/api/chat/room/")) {
        const roomId = path.split("/")[4];
        const id = env.CHAT_ROOM.idFromName(roomId);
        const stub = env.CHAT_ROOM.get(id);
        return stub.fetch(request);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }
};
