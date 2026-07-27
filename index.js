// ============================================================
// NAJD PLATFORM API
// Cloudflare Worker
// D1 Database
// Durable Objects
// WebSocket Chat
// No R2
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
// PASSWORD HASH
// SHA-256
// ============================================================

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const data = encoder.encode(password);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// TOKEN
// ============================================================

function createToken() {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

// ============================================================
// AUTHENTICATION
// ============================================================

async function getAuthenticatedUser(request, env) {
  const auth = request.headers.get("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  const session = await env.DB.prepare(
    `
    SELECT
      sessions.*,
      users.username,
      users.display_name,
      users.email,
      users.avatar_url,
      users.bio
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.deleted_at IS NULL
    LIMIT 1
    `
  )
    .bind(token, Date.now())
    .first();

  return session || null;
}

// ============================================================
// DURABLE OBJECT
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
        "Expected WebSocket connection",
        {
          status: 426,
        }
      );
    }

    const pair = new WebSocketPair();

    const client = pair[0];
    const server = pair[1];

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(websocket) {
    websocket.accept();

    this.sessions.add(websocket);

    websocket.addEventListener(
      "message",
      async (event) => {
        try {
          const data = JSON.parse(event.data);

          const message = JSON.stringify({
            ...data,
            timestamp: Date.now(),
          });

          for (const session of this.sessions) {
            if (
              session.readyState === WebSocket.OPEN
            ) {
              session.send(message);
            }
          }
        } catch (error) {
          console.error(
            "WebSocket message error:",
            error
          );
        }
      }
    );

    websocket.addEventListener(
      "close",
      () => {
        this.sessions.delete(websocket);
      }
    );

    websocket.addEventListener(
      "error",
      () => {
        this.sessions.delete(websocket);
      }
    );
  }
}

// ============================================================
// WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const path = url.pathname;

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
      // ROOT
      // ======================================================

      if (
        (path === "/" || path === "/api") &&
        method === "GET"
      ) {
        return json({
          success: true,
          name: API_NAME,
          version: VERSION,
          status: "online",
          database: env.DB ? "connected" : "not_configured",
          services: {
            d1: !!env.DB,
            r2: false,
            durable_objects: !!env.CHAT_ROOM,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // ======================================================
      // HEALTH
      // ======================================================

      if (
        path === "/health" &&
        method === "GET"
      ) {
        let database = false;

        if (env.DB) {
          try {
            await env.DB
              .prepare("SELECT 1")
              .first();

            database = true;
          } catch {
            database = false;
          }
        }

        return json({
          success: true,
          status: "healthy",
          database,
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

        const username = String(
          body.username || ""
        ).trim();

        const password = String(
          body.password || ""
        );

        const displayName = String(
          body.display_name ||
          body.displayName ||
          username
        ).trim();

        const email = body.email
          ? String(body.email).trim()
          : null;

        if (!username) {
          return json(
            {
              success: false,
              message: "اسم المستخدم مطلوب",
            },
            400
          );
        }

        if (username.length < 3) {
          return json(
            {
              success: false,
              message:
                "اسم المستخدم يجب أن يكون 3 أحرف على الأقل",
            },
            400
          );
        }

        if (!password) {
          return json(
            {
              success: false,
              message: "كلمة المرور مطلوبة",
            },
            400
          );
        }

        if (password.length < 6) {
          return json(
            {
              success: false,
              message:
                "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
            },
            400
          );
        }

        const existingUser =
          await env.DB.prepare(
            `
            SELECT id
            FROM users
            WHERE username = ?
              AND deleted_at IS NULL
            LIMIT 1
            `
          )
            .bind(username)
            .first();

        if (existingUser) {
          return json(
            {
              success: false,
              message:
                "اسم المستخدم مستخدم بالفعل",
            },
            409
          );
        }

        if (email) {
          const existingEmail =
            await env.DB.prepare(
              `
              SELECT id
              FROM users
              WHERE email = ?
                AND deleted_at IS NULL
              LIMIT 1
              `
            )
              .bind(email)
              .first();

          if (existingEmail) {
            return json(
              {
                success: false,
                message:
                  "البريد الإلكتروني مستخدم بالفعل",
              },
              409
            );
          }
        }

        const id =
          "user_" + crypto.randomUUID();

        const passwordHash =
          await hashPassword(password);

        const now = Date.now();

        await env.DB.prepare(
          `
          INSERT INTO users (
            id,
            username,
            password_hash,
            display_name,
            email,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
          .bind(
            id,
            username,
            passwordHash,
            displayName,
            email,
            now,
            now
          )
          .run();

        return json(
          {
            success: true,
            message:
              "تم إنشاء الحساب بنجاح",
            userId: id,
          },
          201
        );
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

        const username = String(
          body.username || ""
        ).trim();

        const password = String(
          body.password || ""
        );

        if (!username || !password) {
          return json(
            {
              success: false,
              message:
                "اسم المستخدم وكلمة المرور مطلوبان",
            },
            400
          );
        }

        const passwordHash =
          await hashPassword(password);

        const user =
          await env.DB.prepare(
            `
            SELECT *
            FROM users
            WHERE username = ?
              AND password_hash = ?
              AND deleted_at IS NULL
            LIMIT 1
            `
          )
            .bind(
              username,
              passwordHash
            )
            .first();

        if (!user) {
          return json(
            {
              success: false,
              message:
                "بيانات الدخول غير صحيحة",
            },
            401
          );
        }

        const token = createToken();

        const sessionId =
          "session_" +
          crypto.randomUUID();

        const now = Date.now();

        const expiresAt =
          now + 30 * 24 * 60 * 60 * 1000;

        await env.DB.prepare(
          `
          INSERT INTO sessions (
            id,
            user_id,
            token_hash,
            expires_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
          `
        )
          .bind(
            sessionId,
            user.id,
            token,
            expiresAt,
            now
          )
          .run();

        delete user.password_hash;

        return json({
          success: true,
          token,
          user,
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
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              success: false,
              message: "غير مصرح",
            },
            401
          );
        }

        return json({
          success: true,
          user: {
            id: user.user_id,
            username: user.username,
            display_name:
              user.display_name,
            email: user.email,
            avatar_url:
              user.avatar_url,
            bio: user.bio,
          },
        });
      }

      // ======================================================
      // LOGOUT
      // DELETE /api/auth/logout
      // ======================================================

      if (
        path === "/api/auth/logout" &&
        method === "DELETE"
      ) {
        const auth =
          request.headers.get(
            "Authorization"
          );

        if (auth) {
          const token =
            auth.replace(
              "Bearer ",
              ""
            ).trim();

          await env.DB.prepare(
            `
            DELETE FROM sessions
            WHERE token_hash = ?
            `
          )
            .bind(token)
            .run();
        }

        return json({
          success: true,
          message:
            "تم تسجيل الخروج",
        });
      }

      // ======================================================
      // STORIES - GET
      // ======================================================

      if (
        path === "/api/stories" &&
        method === "GET"
      ) {
        const result =
          await env.DB.prepare(
            `
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
            `
          )
            .bind(Date.now())
            .all();

        return json({
          success: true,
          stories:
            result.results || [],
        });
      }

      // ======================================================
      // STORIES - POST
      // ======================================================

      if (
        path === "/api/stories" &&
        method === "POST"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              success: false,
              message: "غير مصرح",
            },
            401
          );
        }

        const body =
          await request.json();

        const mediaUrl =
          String(
            body.media_url || ""
          ).trim();

        const mediaType =
          String(
            body.media_type || "image"
          ).trim();

        const caption =
          String(
            body.caption || ""
          ).trim();

        if (!mediaUrl) {
          return json(
            {
              success: false,
              message:
                "رابط الوسائط مطلوب",
            },
            400
          );
        }

        if (
          !["image", "video"].includes(
            mediaType
          )
        ) {
          return json(
            {
              success: false,
              message:
                "نوع الوسائط غير صحيح",
            },
            400
          );
        }

        const id =
          "story_" +
          crypto.randomUUID();

        const now = Date.now();

        const expiresAt =
          now + 24 * 60 * 60 * 1000;

        await env.DB.prepare(
          `
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
          `
        )
          .bind(
            id,
            user.user_id,
            mediaUrl,
            mediaType,
            caption,
            expiresAt,
            now
          )
          .run();

        return json(
          {
            success: true,
            storyId: id,
          },
          201
        );
      }

      // ======================================================
      // DELETE STORY
      // ======================================================

      if (
        path.startsWith(
          "/api/stories/"
        ) &&
        method === "DELETE"
      ) {
        const user =
          await getAuthenticatedUser(
            request,
            env
          );

        if (!user) {
          return json(
            {
              success: false,
              message: "غير مصرح",
            },
            401
          );
        }

        const storyId =
          path.split("/")[3];

        const result =
          await env.DB.prepare(
            `
            DELETE FROM stories
            WHERE id = ?
              AND user_id = ?
            `
          )
            .bind(
              storyId,
              user.user_id
            )
            .run();

        return json({
          success: true,
          deleted:
            result.meta.changes > 0,
        });
      }

      // ======================================================
      // CHAT
      // ======================================================

      if (
        path.startsWith(
          "/api/chat/room/"
        )
      ) {
        if (!env.CHAT_ROOM) {
          return json(
            {
              success: false,
              message:
                "Durable Object غير مربوط",
            },
            500
          );
        }

        const roomId =
          path.split("/")[4];

        if (!roomId) {
          return json(
            {
              success: false,
              message:
                "معرف الغرفة مطلوب",
            },
            400
          );
        }

        const id =
          env.CHAT_ROOM.idFromName(
            roomId
          );

        const stub =
          env.CHAT_ROOM.get(id);

        return stub.fetch(request);
      }

      // ======================================================
      // 404
      // ======================================================

      return json(
        {
          success: false,
          message:
            "المسار غير موجود",
          path,
          method,
        },
        404
      );

    } catch (error) {
      console.error(
        "API ERROR:",
        error
      );

      return json(
        {
          success: false,
          message:
            "حدث خطأ داخلي في الخادم",
          error:
            error.message,
        },
        500
      );
    }
  },
};
