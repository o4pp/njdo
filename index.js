// ============================================================
// NAJD PLATFORM API v2.3.0
// Cloudflare Workers + D1 + Durable Objects
// بدون R2
// ============================================================

const VERSION = "2.3.0";
const API_NAME = "NAJD API";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

// ============================================================
// RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

// ============================================================
// PASSWORD
// ============================================================

function encodePassword(password) {
  return btoa(unescape(encodeURIComponent(password)));
}

// ============================================================
// AUTH
// ============================================================

function getToken(request) {
  const auth = request.headers.get("Authorization");

  if (!auth) return null;

  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return auth.trim();
}

// ============================================================
// VALIDATION
// ============================================================

function validateUsername(username) {
  return (
    typeof username === "string" &&
    username.trim().length >= 3 &&
    username.trim().length <= 30
  );
}

function validatePassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 6
  );
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
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", {
        status: 426
      });
    }

    const pair = new WebSocketPair();

    const client = pair[0];
    const server = pair[1];

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleSession(websocket) {
    websocket.accept();

    this.sessions.add(websocket);

    websocket.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);

        const message = JSON.stringify({
          ...data,
          timestamp: Date.now()
        });

        for (const session of this.sessions) {
          if (session.readyState === WebSocket.OPEN) {
            session.send(message);
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    websocket.addEventListener("close", () => {
      this.sessions.delete(websocket);
    });

    websocket.addEventListener("error", () => {
      this.sessions.delete(websocket);
    });
  }
}

// ============================================================
// MAIN WORKER
// ============================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
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
        let durableObjects = false;

        try {
          await env.DB.prepare(
            "SELECT 1"
          ).first();

          database = true;
        } catch (error) {
          database = false;
        }

        try {
          durableObjects = !!env.CHAT_ROOM;
        } catch (error) {
          durableObjects = false;
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
            durable_objects: durableObjects
          },
          timestamp: new Date().toISOString()
        });
      }

      // ======================================================
      // REGISTER
      // POST /auth/register
      // ======================================================

      if (
        path === "/auth/register" &&
        method === "POST"
      ) {

        const body = await request.json();

        const username = String(
          body.username || ""
        ).trim().toLowerCase();

        const displayName = String(
          body.display_name || username
        ).trim();

        const password = String(
          body.password || ""
        );

        if (!validateUsername(username)) {
          return json({
            success: false,
            message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
          }, 400);
        }

        if (!validatePassword(password)) {
          return json({
            success: false,
            message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
          }, 400);
        }

        if (!displayName) {
          return json({
            success: false,
            message: "الاسم مطلوب"
          }, 400);
        }

        // فحص الحساب قبل الإدخال
        const existingUser = await env.DB.prepare(
          `
          SELECT id, username
          FROM users
          WHERE LOWER(username) = ?
          LIMIT 1
          `
        )
        .bind(username)
        .first();

        if (existingUser) {
          return json({
            success: false,
            code: "USERNAME_EXISTS",
            message: "اسم المستخدم موجود مسبقًا"
          }, 409);
        }

        const userId =
          "user_" + crypto.randomUUID();

        const passwordHash =
          encodePassword(password);

        const now = Date.now();

        try {

          await env.DB.prepare(
            `
            INSERT INTO users
            (
              id,
              username,
              password_hash,
              display_name,
              created_at
            )
            VALUES (?, ?, ?, ?, ?)
            `
          )
          .bind(
            userId,
            username,
            passwordHash,
            displayName,
            now
          )
          .run();

        } catch (error) {

          if (
            String(error.message)
              .toLowerCase()
              .includes("unique")
          ) {
            return json({
              success: false,
              code: "USERNAME_EXISTS",
              message: "اسم المستخدم موجود مسبقًا"
            }, 409);
          }

          throw error;
        }

        return json({
          success: true,
          message: "تم إنشاء الحساب بنجاح",
          user: {
            id: userId,
            username,
            display_name: displayName
          }
        }, 201);
      }

      // ======================================================
      // LOGIN
      // POST /auth/login
      // ======================================================

      if (
        path === "/auth/login" &&
        method === "POST"
      ) {

        const body = await request.json();

        const username = String(
          body.username || ""
        ).trim().toLowerCase();

        const password = String(
          body.password || ""
        );

        if (!username || !password) {
          return json({
            success: false,
            message: "اسم المستخدم وكلمة المرور مطلوبة"
          }, 400);
        }

        const passwordHash =
          encodePassword(password);

        const user = await env.DB.prepare(
          `
          SELECT
            id,
            username,
            password_hash,
            display_name,
            avatar_url,
            created_at
          FROM users
          WHERE LOWER(username) = ?
          LIMIT 1
          `
        )
        .bind(username)
        .first();

        if (!user) {
          return json({
            success: false,
            message: "اسم المستخدم أو كلمة المرور غير صحيحة"
          }, 401);
        }

        if (
          user.password_hash !== passwordHash
        ) {
          return json({
            success: false,
            message: "اسم المستخدم أو كلمة المرور غير صحيحة"
          }, 401);
        }

        // نستخدم ID كتوكين مؤقت
        const token = user.id;

        delete user.password_hash;

        return json({
          success: true,
          message: "تم تسجيل الدخول بنجاح",
          token,
          user
        });
      }

      // ======================================================
      // CURRENT USER
      // GET /auth/me
      // ======================================================

      if (
        path === "/auth/me" &&
        method === "GET"
      ) {

        const token = getToken(request);

        if (!token) {
          return json({
            success: false,
            message: "غير مصرح"
          }, 401);
        }

        const user = await env.DB.prepare(
          `
          SELECT
            id,
            username,
            display_name,
            avatar_url,
            created_at
          FROM users
          WHERE id = ?
          LIMIT 1
          `
        )
        .bind(token)
        .first();

        if (!user) {
          return json({
            success: false,
            message: "المستخدم غير موجود"
          }, 401);
        }

        return json({
          success: true,
          user
        });
      }

      // ======================================================
      // STORIES - GET
      // ======================================================

      if (
        path === "/stories" &&
        method === "GET"
      ) {

        const result = await env.DB.prepare(
          `
          SELECT
            s.id,
            s.user_id,
            s.media_url,
            s.media_type,
            s.caption,
            s.expires_at,
            s.created_at,
            u.username,
            u.display_name,
            u.avatar_url
          FROM stories s
          JOIN users u
            ON s.user_id = u.id
          WHERE s.expires_at > ?
          ORDER BY s.created_at DESC
          `
        )
        .bind(Date.now())
        .all();

        return json({
          success: true,
          stories: result.results || []
        });
      }

      // ======================================================
      // STORIES - POST
      // ======================================================

      if (
        path === "/stories" &&
        method === "POST"
      ) {

        const token = getToken(request);

        if (!token) {
          return json({
            success: false,
            message: "يجب تسجيل الدخول أولًا"
          }, 401);
        }

        const user = await env.DB.prepare(
          `
          SELECT id
          FROM users
          WHERE id = ?
          LIMIT 1
          `
        )
        .bind(token)
        .first();

        if (!user) {
          return json({
            success: false,
            message: "جلسة الدخول غير صالحة"
          }, 401);
        }

        const body = await request.json();

        const mediaUrl = String(
          body.media_url || ""
        ).trim();

        const mediaType = String(
          body.media_type || ""
        ).trim();

        const caption = String(
          body.caption || ""
        ).trim();

        if (!mediaUrl || !mediaType) {
          return json({
            success: false,
            message: "رابط الوسائط ونوع الوسائط مطلوبان"
          }, 400);
        }

        if (
          mediaType !== "image" &&
          mediaType !== "video"
        ) {
          return json({
            success: false,
            message: "نوع الوسائط يجب أن يكون image أو video"
          }, 400);
        }

        const storyId =
          "story_" + crypto.randomUUID();

        const now = Date.now();

        await env.DB.prepare(
          `
          INSERT INTO stories
          (
            id,
            user_id,
            media_url,
            media_type,
            caption,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .bind(
          storyId,
          token,
          mediaUrl,
          mediaType,
          caption,
          now + 86400000,
          now
        )
        .run();

        return json({
          success: true,
          message: "تم نشر القصة",
          storyId
        }, 201);
      }

      // ======================================================
      // CHAT ROOM
      // ======================================================

      if (
        path.startsWith("/chat/room/")
      ) {

        if (!env.CHAT_ROOM) {
          return json({
            success: false,
            message: "خدمة المحادثة غير متاحة"
          }, 503);
        }

        const roomId =
          path.split("/")[3];

        if (!roomId) {
          return json({
            success: false,
            message: "معرف الغرفة مطلوب"
          }, 400);
        }

        const id =
          env.CHAT_ROOM.idFromName(roomId);

        const stub =
          env.CHAT_ROOM.get(id);

        return stub.fetch(request);
      }

      // ======================================================
      // 404
      // ======================================================

      return json({
        success: false,
        code: "NOT_FOUND",
        message: "المسار غير موجود",
        path,
        method
      }, 404);

    } catch (error) {

      console.error("API ERROR:", error);

      return json({
        success: false,
        code: "SERVER_ERROR",
        message: "حدث خطأ داخلي في الخادم",
        error: error.message
      }, 500);
    }
  }
};
