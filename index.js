const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(websocket) {
    websocket.accept();
    this.sessions.add(websocket);
    websocket.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const payload = JSON.stringify({ ...data, timestamp: Date.now() });
        for (const session of this.sessions) {
          if (session.readyState === WebSocket.OPEN) {
            session.send(payload);
          }
        }
      } catch (err) {
        console.error("WS error:", err);
      }
    });
    websocket.addEventListener("close", () => this.sessions.delete(websocket));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

    if (path.startsWith("/api/")) {
      try {
        if (path === "/api/" || path === "/api") {
          let dbStatus = true;
          try {
            await env.DB.prepare("SELECT 1").first();
          } catch {
            dbStatus = false;
          }
          return json({
            success: true,
            name: "NAJD API",
            version: "3.0.0",
            status: "online",
            database: dbStatus ? "connected" : "error",
            services: { d1: dbStatus, durable_objects: true },
            timestamp: new Date().toISOString()
          });
        }

        if (path === "/api/auth/register" && method === "POST") {
          const { username, password, display_name } = await request.json();
          if (!username || !password) return json({ success: false, message: "اسم المستخدم وكلمة المرور مطلوبة" }, 400);
          const id = "user_" + crypto.randomUUID();
          const password_hash = btoa(password);

          try {
            await env.DB.prepare(
              "INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
            ).bind(id, username, password_hash, display_name || username, Date.now()).run();
          } catch (e) {
            return json({ success: false, message: "اسم المستخدم مستخدم مسبقاً" }, 400);
          }

          return json({ success: true, userId: id }, 201);
        }

        if (path === "/api/auth/login" && method === "POST") {
          const { username, password } = await request.json();
          const password_hash = btoa(password);

          const user = await env.DB.prepare(
            "SELECT id, username, display_name, avatar_url, created_at FROM users WHERE username = ? AND password_hash = ?"
          ).bind(username, password_hash).first();

          if (!user) return json({ success: false, message: "بيانات الدخول غير صحيحة" }, 401);

          return json({ success: true, token: user.id, user });
        }

        if (path === "/api/stories" && method === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT s.*, u.username, u.display_name, u.avatar_url FROM stories s JOIN users u ON s.user_id = u.id WHERE s.expires_at > ? ORDER BY s.created_at DESC"
          ).bind(Date.now()).all();
          return json({ success: true, stories: results || [] });
        }

        if (path === "/api/stories" && method === "POST") {
          const auth = request.headers.get("Authorization");
          if (!auth) return json({ success: false, message: "غير مرخص" }, 401);
          const userId = auth.replace("Bearer ", "");
          const { media_url, media_type, caption } = await request.json();
          const id = "story_" + crypto.randomUUID();
          const now = Date.now();

          await env.DB.prepare(
            "INSERT INTO stories (id, user_id, media_url, media_type, caption, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(id, userId, media_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600", media_type || "image", caption || "", now + 86400000, now).run();

          return json({ success: true, storyId: id }, 201);
        }

        if (path.startsWith("/api/chat/room/")) {
          const roomId = path.split("/")[4];
          if (!roomId) return json({ success: false, message: "معرف الغرفة مطلوب" }, 400);
          const id = env.CHAT_ROOM.idFromName(roomId);
          const stub = env.CHAT_ROOM.get(id);
          return stub.fetch(request);
        }

        return json({ success: false, message: "المسار غير موجود" }, 404);
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
