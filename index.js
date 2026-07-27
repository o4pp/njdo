// ============================================================
// NAJD PLATFORM API v2.2.0
// Cloudflare Workers
// D1 Database
// Durable Objects WebSocket Chat
// No R2 Required
// ============================================================

const VERSION = "2.2.0";
const API_NAME = "NAJD API";

// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================================
// JSON RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// ============================================================
// HASH PASSWORD
// ============================================================

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// AUTH TOKEN
// ============================================================

function createToken() {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

function getToken(request) {
  const header = request.headers.get("Authorization");

  if (!header) return null;

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.substring(7).trim();
}

async function getCurrentUser(request, env) {
  const token = getToken(request);

  if (!token) {
    return null;
  }

  const session = await env.DB.prepare(`
    SELECT
      sessions.*,
      users.id AS user_id,
      users.username,
      users.email,
      users.display_name,
      users.avatar_url,
      users.bio,
      users.created_at AS user_created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.deleted_at IS NULL
    LIMIT 1
  `)
    .bind(token, Date.now())
    .first();

  if (!session) {
    return null;
  }

  return {
    id: session.user_id,
    username: session.username,
    email: session.email,
    display_name: session.display_name,
    avatar_url: session.avatar_url,
    bio: session.bio,
    created_at: session.user_created_at,
  };
}

// ============================================================
// DURABLE OBJECT CHAT ROOM
// ============================================================

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");

    if (upgrade !== "websocket") {
      return new Response(
        "Expected Upgrade: websocket",
        {
          status: 426,
          headers: CORS_HEADERS,
        }
      );
    }

    const pair = new WebSocketPair();

    const client = pair[0];
    const server = pair[1];

    server.accept();

    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        const message = JSON.stringify({
          ...data,
          timestamp: Date.now(),
        });

        for (const session of this.sessions) {
          if (session.readyState === WebSocket.OPEN) {
            session.send(message);
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });

    server.addEventListener("error", () => {
      this.sessions.delete(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

// ============================================================
// WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    // ========================================================
    // OPTIONS
    // ========================================================

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      // ======================================================
      // HEALTH
      // ======================================================

      if (
        path === "/" ||
        path === "/api" ||
        path === "/health"
      ) {
        let database = false;

        try {
          await env.DB.prepare("SELECT 1").first();
          database = true;
        } catch (error) {
          database = false;
        }

        return json({
          success: true,
          name: API_NAME,
          version: VERSION,
          status: "online",
          database: database ? "connected" : "error",
          services: {
            d1: database,
            r2: false,
            durable_objects: Boolean(env.CHAT_ROOM),
          },
          timestamp: new Date().toISOString(),
        });
      }

      // ======================================================
      // REGISTER
      // POST /api/auth/register
      // ======================================================

      if (
        path === "/api/auth/register" &&
        method === "POST"
      ) {
        const body = await request.json();

        const username = String(body.username || "")
          .trim()
          .toLowerCase();

        const password = String(body.password || "");

        const displayName = String(
          body.display_name || username
        ).trim();

        const email = body.email
          ? String(body.email).trim().toLowerCase()
          : null;

        if (!username) {
          return json({
            success: false,
            message: "اسم المستخدم مطلوب",
          }, 400);
        }

        if (username.length < 3) {
          return json({
            success: false,
            message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل",
          }, 400);
        }

        if (!password || password.length < 6) {
          return json({
            success: false,
            message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
          }, 400);
        }

        const existing = await env.DB.prepare(`
          SELECT id
          FROM users
          WHERE username = ?
             OR (? IS NOT NULL AND email = ?)
          LIMIT 1
        `)
          .bind(username, email, email)
          .first();

        if (existing) {
          return json({
            success: false,
            message: "اسم المستخدم أو البريد الإلكتروني مستخدم مسبقاً",
          }, 409);
        }

        const id = "user_" + crypto.randomUUID();

        const passwordHash = await hashPassword(password);

        const now = Date.now();

        await env.DB.prepare(`
          INSERT INTO users (
            id,
            username,
            email,
            password_hash,
            display_name,
            avatar_url,
            bio,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            id,
            username,
            email,
            passwordHash,
            displayName,
            "https://api.iconify.design/solar:user-bold-duotone.svg",
            "",
            now,
            now
          )
          .run();

        return json({
          success: true,
          message: "تم إنشاء الحساب بنجاح",
          userId: id,
        }, 201);
      }

      // ======================================================
      // LOGIN
      // POST /api/auth/login
      // ======================================================

      if (
        path === "/api/auth/login" &&
        method === "POST"
      ) {
        const body = await request.json();

        const username = String(body.username || "")
          .trim()
          .toLowerCase();

        const password = String(body.password || "");

        if (!username || !password) {
          return json({
            success: false,
            message: "اسم المستخدم وكلمة المرور مطلوبان",
          }, 400);
        }

        const passwordHash = await hashPassword(password);

        const user = await env.DB.prepare(`
          SELECT *
          FROM users
          WHERE username = ?
            AND password_hash = ?
            AND deleted_at IS NULL
          LIMIT 1
        `)
          .bind(username, passwordHash)
          .first();

        if (!user) {
          return json({
            success: false,
            message: "بيانات الدخول غير صحيحة",
          }, 401);
        }

        const token = createToken();

        const tokenHash = token;

        const sessionId = "session_" + crypto.randomUUID();

        const expiresAt =
          Date.now() + 30 * 24 * 60 * 60 * 1000;

        await env.DB.prepare(`
          INSERT INTO sessions (
            id,
            user_id,
            token_hash,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `)
          .bind(
            sessionId,
            user.id,
            tokenHash,
            expiresAt,
            Date.now()
          )
          .run();

        delete user.password_hash;

        return json({
          success: true,
          token,
          expires_at: expiresAt,
          user,
        });
      }

      // ======================================================
      // LOGOUT
      // POST /api/auth/logout
      // ======================================================

      if (
        path === "/api/auth/logout" &&
        method === "POST"
      ) {
        const token = getToken(request);

        if (token) {
          await env.DB.prepare(`
            DELETE FROM sessions
            WHERE token_hash = ?
          `)
            .bind(token)
            .run();
        }

        return json({
          success: true,
          message: "تم تسجيل الخروج",
        });
      }

      // ======================================================
      // CURRENT USER
      // GET /api/auth/me
      // ======================================================

      if (
        path === "/api/auth/me" &&
        method === "GET"
      ) {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({
            success: false,
            message: "غير مصرح",
          }, 401);
        }

        return json({
          success: true,
          user,
        });
      }

      // ======================================================
      // GET STORIES
      // GET /api/stories
      // ======================================================

      if (
        path === "/api/stories" &&
        method === "GET"
      ) {
        const now = Date.now();

        const { results } = await env.DB.prepare(`
          SELECT
            stories.*,
            users.username,
            users.display_name,
            users.avatar_url
          FROM stories
          JOIN users
            ON users.id = stories.user_id
          WHERE stories.expires_at > ?
            AND users.deleted_at IS NULL
          ORDER BY stories.created_at DESC
        `)
          .bind(now)
          .all();

        return json({
          success: true,
          stories: results || [],
        });
      }

      // ======================================================
      // CREATE STORY
      // POST /api/stories
      // ======================================================

      if (
        path === "/api/stories" &&
        method === "POST"
      ) {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({
            success: false,
            message: "يجب تسجيل الدخول أولاً",
          }, 401);
        }

        const body = await request.json();

        const mediaUrl = String(body.media_url || "").trim();

        const mediaType = String(
          body.media_type || "image"
        ).trim();

        const caption = String(
          body.caption || ""
        ).trim();

        if (!mediaUrl) {
          return json({
            success: false,
            message: "رابط الوسائط مطلوب",
          }, 400);
        }

        if (!["image", "video"].includes(mediaType)) {
          return json({
            success: false,
            message: "نوع الوسائط غير صالح",
          }, 400);
        }

        const id = "story_" + crypto.randomUUID();

        const now = Date.now();

        await env.DB.prepare(`
          INSERT INTO stories (
            id,
            user_id,
            media_url,
            media_type,
            caption,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            id,
            user.id,
            mediaUrl,
            mediaType,
            caption,
            now + 24 * 60 * 60 * 1000,
            now
          )
          .run();

        return json({
          success: true,
          storyId: id,
        }, 201);
      }

      // ======================================================
      // DELETE STORY
      // DELETE /api/stories/:id
      // ======================================================

      if (
        path.startsWith("/api/stories/") &&
        method === "DELETE"
      ) {
        const user = await getCurrentUser(request, env);

        if (!user) {
          return json({
            success: false,
            message: "غير مصرح",
          }, 401);
        }

        const storyId = path.split("/")[3];

        const result = await env.DB.prepare(`
          DELETE FROM stories
          WHERE id = ?
            AND user_id = ?
        `)
          .bind(storyId, user.id)
          .run();

        return json({
          success: true,
          deleted: result.meta.changes > 0,
        });
      }

      // ======================================================
      // WEBSOCKET CHAT
      // /api/chat/room/:roomId
      // ======================================================

      if (
        path.startsWith("/api/chat/room/")
      ) {
        if (!env.CHAT_ROOM) {
          return json({
            success: false,
            message: "خدمة المحادثة غير مفعلة",
          }, 503);
        }

        const roomId = path
          .split("/")
          .filter(Boolean)[3];

        if (!roomId) {
          return json({
            success: false,
            message: "معرف الغرفة مطلوب",
          }, 400);
        }

        const id = env.CHAT_ROOM.idFromName(roomId);

        const stub = env.CHAT_ROOM.get(id);

        return stub.fetch(request);
      }

      // ======================================================
      // NOT FOUND
      // ======================================================

      return json({
        success: false,
        error: "NOT_FOUND",
        message: "المسار غير موجود",
        path,
        method,
      }, 404);

    } catch (error) {
      console.error(error);

      return json({
        success: false,
        error: "INTERNAL_ERROR",
        message: error.message,
      }, 500);
    }
  },
};
