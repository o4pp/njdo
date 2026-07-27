// ============================================================
// NAJD PLATFORM API
// Saudi Social Platform
// Cloudflare Workers
// D1 + Durable Objects + WebSocket
// NO R2
// Version 2.1.0
// ============================================================

const VERSION = "2.1.0";
const API_NAME = "NAJD API";


// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",

  "Access-Control-Max-Age":
    "86400",
};


// ============================================================
// RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          "application/json; charset=utf-8",
      },
    }
  );
}


function success(data = {}, status = 200) {
  return json(
    {
      success: true,
      ...data,
    },
    status
  );
}


function error(
  message,
  code = "ERROR",
  status = 400,
  extra = {}
) {
  return json(
    {
      success: false,
      error: code,
      message,
      ...extra,
    },
    status
  );
}


// ============================================================
// REQUEST HELPERS
// ============================================================

async function getJSON(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}


function getPath(request) {
  const pathname =
    new URL(request.url).pathname;

  return pathname.replace(
    /\/+$/,
    ""
  ) || "/";
}


function getQuery(
  request,
  key,
  fallback = null
) {
  const value =
    new URL(request.url)
      .searchParams
      .get(key);

  return value || fallback;
}


function getPagination(request) {
  const url =
    new URL(request.url);

  let page =
    Number(
      url.searchParams.get(
        "page"
      ) || 1
    );

  let limit =
    Number(
      url.searchParams.get(
        "limit"
      ) || 20
    );

  if (
    !Number.isFinite(page) ||
    page < 1
  ) {
    page = 1;
  }

  if (
    !Number.isFinite(limit) ||
    limit < 1
  ) {
    limit = 20;
  }

  page =
    Math.floor(page);

  limit =
    Math.min(
      Math.floor(limit),
      50
    );

  return {
    page,
    limit,
    offset:
      (page - 1) *
      limit,
  };
}


function getBearerToken(request) {
  const header =
    request.headers.get(
      "Authorization"
    );

  if (!header) {
    return null;
  }

  const match =
    header.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : null;
}


function normalizeEmail(email) {
  return String(
    email || ""
  )
    .trim()
    .toLowerCase();
}


function normalizeUsername(
  username
) {
  return String(
    username || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /^@/,
      ""
    );
}


function cleanText(
  value,
  max = 5000
) {
  return String(
    value ?? ""
  )
    .trim()
    .slice(
      0,
      max
    );
}


function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);
}


function validUsername(
  username
) {
  return /^[a-zA-Z0-9_]{3,30}$/
    .test(username);
}


function validPassword(
  password
) {
  return (
    typeof password === "string" &&
    password.length >= 8
  );
}


function validId(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 200
  );
}


function createId(prefix = "") {
  const id =
    crypto.randomUUID();

  return prefix
    ? `${prefix}_${id}`
    : id;
}


// ============================================================
// DATABASE
// ============================================================

function assertDatabase(env) {
  if (
    !env ||
    !env.DB ||
    typeof env.DB.prepare !==
      "function"
  ) {
    throw new Error(
      "D1 binding DB is not configured"
    );
  }

  return env.DB;
}


async function dbFirst(
  env,
  query,
  params = []
) {
  const DB =
    assertDatabase(env);

  return (
    await DB
      .prepare(query)
      .bind(...params)
      .first()
  ) || null;
}


async function dbAll(
  env,
  query,
  params = []
) {
  const DB =
    assertDatabase(env);

  const result =
    await DB
      .prepare(query)
      .bind(...params)
      .all();

  return result.results || [];
}


async function dbRun(
  env,
  query,
  params = []
) {
  const DB =
    assertDatabase(env);

  return DB
    .prepare(query)
    .bind(...params)
    .run();
}


// ============================================================
// PASSWORD SECURITY
// ============================================================

function randomBytes(
  length = 32
) {
  const bytes =
    new Uint8Array(
      length
    );

  crypto.getRandomValues(
    bytes
  );

  return bytes;
}


function bytesToHex(bytes) {
  return Array
    .from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}


function hexToBytes(hex) {
  if (
    typeof hex !== "string" ||
    hex.length % 2 !== 0
  ) {
    throw new Error(
      "Invalid hexadecimal value"
    );
  }

  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    bytes[i] =
      parseInt(
        hex.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return bytes;
}


async function sha256(
  value
) {
  const data =
    new TextEncoder()
      .encode(
        String(value)
      );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToHex(
    new Uint8Array(
      hash
    )
  );
}


async function hashPassword(
  password
) {
  const salt =
    randomBytes(
      16
    );

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder()
        .encode(
          password
        ),
      "PBKDF2",
      false,
      [
        "deriveBits",
      ]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name:
          "PBKDF2",

        salt,

        iterations:
          100000,

        hash:
          "SHA-256",
      },

      keyMaterial,

      256
    );

  return [
    "pbkdf2",
    "100000",
    bytesToHex(
      salt
    ),
    bytesToHex(
      new Uint8Array(
        derivedBits
      )
    ),
  ].join("$");
}


async function verifyPassword(
  password,
  storedHash
) {
  try {
    const parts =
      String(
        storedHash || ""
      ).split(
        "$"
      );

    if (
      parts.length !== 4
    ) {
      return false;
    }

    const [
      algorithm,
      iterationsText,
      saltHex,
      hashHex,
    ] =
      parts;

    if (
      algorithm !==
      "pbkdf2"
    ) {
      return false;
    }

    const iterations =
      Number(
        iterationsText
      );

    const salt =
      hexToBytes(
        saltHex
      );

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder()
          .encode(
            password
          ),
        "PBKDF2",
        false,
        [
          "deriveBits",
        ]
      );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name:
            "PBKDF2",

          salt,

          iterations,

          hash:
            "SHA-256",
        },

        keyMaterial,

        256
      );

    const result =
      bytesToHex(
        new Uint8Array(
          derivedBits
        )
      );

    return (
      result ===
      hashHex
    );
  } catch {
    return false;
  }
}


// ============================================================
// AUTH
// ============================================================

async function createSession(
  env,
  userId
) {
  const token =
    bytesToHex(
      randomBytes(
        48
      )
    );

  const tokenHash =
    await sha256(
      token
    );

  const sessionId =
    createId(
      "session"
    );

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      sessionId,
      userId,
      tokenHash,
      now +
        30 *
        24 *
        60 *
        60 *
        1000,
      now,
    ]
  );

  return token;
}


async function getCurrentUser(
  request,
  env
) {
  const token =
    getBearerToken(
      request
    );

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(
      token
    );

  return dbFirst(
    env,
    `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,

        u.id,
        u.username,
        u.email,
        u.display_name,
        u.avatar_url,
        u.bio,
        u.created_at

      FROM sessions s

      INNER JOIN users u
        ON u.id = s.user_id

      WHERE
        s.token_hash = ?

        AND s.expires_at > ?

        AND u.deleted_at IS NULL

      LIMIT 1
    `,
    [
      tokenHash,
      Date.now(),
    ]
  );
}


async function requireAuth(
  request,
  env
) {
  const user =
    await getCurrentUser(
      request,
      env
    );

  if (!user) {
    return {
      ok:
        false,

      response:
        error(
          "يجب تسجيل الدخول أولًا",
          "UNAUTHORIZED",
          401
        ),
    };
  }

  return {
    ok:
      true,

    user,
  };
}


function serializeUser(
  user
) {
  if (!user) {
    return null;
  }

  return {
    id:
      user.id,

    username:
      user.username,

    email:
      user.email,

    display_name:
      user.display_name,

    avatar_url:
      user.avatar_url,

    bio:
      user.bio,

    created_at:
      user.created_at,
  };
}


// ============================================================
// REGISTER
// ============================================================

async function register(
  request,
  env
) {
  const body =
    await getJSON(
      request
    );

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const email =
    normalizeEmail(
      body.email
    );

  const username =
    normalizeUsername(
      body.username
    );

  const password =
    body.password;

  const displayName =
    cleanText(
      body.display_name ||
      body.displayName ||
      username,
      80
    );

  if (!validEmail(email)) {
    return error(
      "البريد الإلكتروني غير صحيح",
      "INVALID_EMAIL",
      400
    );
  }

  if (
    !validUsername(
      username
    )
  ) {
    return error(
      "اسم المستخدم غير صحيح",
      "INVALID_USERNAME",
      400
    );
  }

  if (
    !validPassword(
      password
    )
  ) {
    return error(
      "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
      "WEAK_PASSWORD",
      400
    );
  }

  const existing =
    await dbFirst(
      env,
      `
        SELECT
          id,
          email,
          username

        FROM users

        WHERE
          email = ?
          OR username = ?

        LIMIT 1
      `,
      [
        email,
        username,
      ]
    );

  if (existing) {
    return error(
      existing.email ===
        email
        ? "البريد الإلكتروني مستخدم مسبقًا"
        : "اسم المستخدم مستخدم مسبقًا",

      existing.email ===
        email
        ? "EMAIL_EXISTS"
        : "USERNAME_EXISTS",

      409
    );
  }

  const id =
    createId(
      "user"
    );

  const passwordHash =
    await hashPassword(
      password
    );

  const now =
    Date.now();

  await dbRun(
    env,
    `
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
    `,
    [
      id,
      username,
      email,
      passwordHash,
      displayName,
      null,
      "",
      now,
      now,
    ]
  );

  const token =
    await createSession(
      env,
      id
    );

  const user =
    await dbFirst(
      env,
      `
        SELECT
          id,
          username,
          email,
          display_name,
          avatar_url,
          bio,
          created_at

        FROM users

        WHERE id = ?
      `,
      [
        id,
      ]
    );

  return success(
    {
      message:
        "تم إنشاء الحساب بنجاح",

      token,

      user:
        serializeUser(
          user
        ),
    },
    201
  );
}


// ============================================================
// LOGIN
// ============================================================

async function login(
  request,
  env
) {
  const body =
    await getJSON(
      request
    );

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const identifier =
    String(
      body.identifier ||
      body.email ||
      body.username ||
      ""
    )
      .trim()
      .toLowerCase();

  const password =
    body.password;

  if (
    !identifier ||
    !password
  ) {
    return error(
      "بيانات الدخول مطلوبة",
      "MISSING_CREDENTIALS",
      400
    );
  }

  const user =
    await dbFirst(
      env,
      `
        SELECT *
        FROM users

        WHERE
          (
            email = ?
            OR username = ?
          )

        AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        identifier,
        identifier,
      ]
    );

  if (!user) {
    return error(
      "بيانات الدخول غير صحيحة",
      "INVALID_CREDENTIALS",
      401
    );
  }

  const valid =
    await verifyPassword(
      password,
      user.password_hash
    );

  if (!valid) {
    return error(
      "بيانات الدخول غير صحيحة",
      "INVALID_CREDENTIALS",
      401
    );
  }

  const token =
    await createSession(
      env,
      user.id
    );

  return success(
    {
      message:
        "تم تسجيل الدخول",

      token,

      user:
        serializeUser(
          user
        ),
    }
  );
}


// ============================================================
// ME
// ============================================================

async function me(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  return success(
    {
      user:
        serializeUser(
          auth.user
        ),
    }
  );
}


// ============================================================
// LOGOUT
// ============================================================

async function logout(
  request,
  env
) {
  const token =
    getBearerToken(
      request
    );

  if (token) {
    const tokenHash =
      await sha256(
        token
      );

    await dbRun(
      env,
      `
        DELETE FROM sessions
        WHERE token_hash = ?
      `,
      [
        tokenHash,
      ]
    );
  }

  return success(
    {
      message:
        "تم تسجيل الخروج",
    }
  );
}


// ============================================================
// STORIES
// ============================================================

async function getStories(
  env
) {
  const stories =
    await dbAll(
      env,
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

        INNER JOIN users u
          ON u.id = s.user_id

        WHERE
          s.expires_at > ?

          AND u.deleted_at IS NULL

        ORDER BY
          s.created_at DESC
      `,
      [
        Date.now(),
      ]
    );

  return success(
    {
      stories,
    }
  );
}


async function createStory(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const mediaUrl =
    cleanText(
      body.media_url,
      2000
    );

  const mediaType =
    cleanText(
      body.media_type,
      50
    );

  const caption =
    cleanText(
      body.caption,
      1000
    );

  if (
    !mediaUrl &&
    !caption
  ) {
    return error(
      "القصة فارغة",
      "EMPTY_STORY",
      400
    );
  }

  const id =
    createId(
      "story"
    );

  const now =
    Date.now();

  const expiresAt =
    now +
    24 *
    60 *
    60 *
    1000;

  await dbRun(
    env,
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
    `,
    [
      id,
      auth.user.user_id,
      mediaUrl || null,
      mediaType || null,
      caption,
      expiresAt,
      now,
    ]
  );

  return success(
    {
      message:
        "تم نشر القصة",

      story: {
        id,

        user_id:
          auth.user.user_id,

        media_url:
          mediaUrl || null,

        media_type:
          mediaType || null,

        caption,

        expires_at:
          expiresAt,

        created_at:
          now,
      },
    },
    201
  );
}


// ============================================================
// PROFILE
// ============================================================

async function getProfile(
  env,
  username
) {
  const user =
    await dbFirst(
      env,
      `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.bio,
          u.created_at,

          (
            SELECT COUNT(*)
            FROM followers f
            WHERE
              f.following_id =
              u.id
          ) AS followers_count,

          (
            SELECT COUNT(*)
            FROM followers f
            WHERE
              f.follower_id =
              u.id
          ) AS following_count

        FROM users u

        WHERE
          u.username = ?

          AND u.deleted_at IS NULL

        LIMIT 1
      `,
      [
        normalizeUsername(
          username
        ),
      ]
    );

  if (!user) {
    return error(
      "المستخدم غير موجود",
      "USER_NOT_FOUND",
      404
    );
  }

  return success(
    {
      user,
    }
  );
}


// ============================================================
// HEALTH
// ============================================================

async function health(
  env
) {
  let database =
    "error";

  try {
    assertDatabase(
      env
    );

    await env.DB
      .prepare(
        "SELECT 1 AS ok"
      )
      .first();

    database =
      "connected";
  } catch (
    err
  ) {
    console.error(
      "D1 HEALTH ERROR:",
      err
    );

    database =
      "error";
  }

  return success(
    {
      name:
        API_NAME,

      version:
        VERSION,

      status:
        "online",

      database,

      services: {
        d1:
          database ===
          "connected",

        r2:
          false,

        durable_objects:
          Boolean(
            env.CHAT_ROOM
          ),
      },

      timestamp:
        new Date()
          .toISOString(),
    }
  );
}


// ============================================================
// API ROUTER
// ============================================================

async function apiRouter(
  request,
  env
) {
  const method =
    request.method
      .toUpperCase();

  const path =
    getPath(
      request
    );

  if (
    method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status:
          204,

        headers:
          CORS_HEADERS,
      }
    );
  }

  if (
    method === "GET" &&
    (
      path === "/" ||
      path === "/api" ||
      path === "/health"
    )
  ) {
    return health(
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/auth/register"
  ) {
    return register(
      request,
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/auth/login"
  ) {
    return login(
      request,
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/auth/logout"
  ) {
    return logout(
      request,
      env
    );
  }

  if (
    method === "GET" &&
    path ===
      "/api/auth/me"
  ) {
    return me(
      request,
      env
    );
  }

  if (
    method === "GET" &&
    path ===
      "/api/stories"
  ) {
    return getStories(
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/stories"
  ) {
    return createStory(
      request,
      env
    );
  }

  const profileMatch =
    path.match(
      /^\/api\/users\/([^/]+)$/
    );

  if (
    method === "GET" &&
    profileMatch
  ) {
    return getProfile(
      env,
      profileMatch[1]
    );
  }

  if (
    path.startsWith(
      "/api/chat/room/"
    )
  ) {
    if (
      !env.CHAT_ROOM ||
      typeof env.CHAT_ROOM.idFromName !==
        "function"
    ) {
      return error(
        "Durable Object غير مربوط",
        "DO_NOT_CONFIGURED",
        500
      );
    }

    const roomId =
      path.split(
        "/"
      )[4];

    if (!roomId) {
      return error(
        "معرف الغرفة مطلوب",
        "ROOM_ID_REQUIRED",
        400
      );
    }

    const id =
      env.CHAT_ROOM.idFromName(
        roomId
      );

    const stub =
      env.CHAT_ROOM.get(
        id
      );

    return stub.fetch(
      request
    );
  }

  return error(
    "المسار غير موجود",
    "NOT_FOUND",
    404,
    {
      path,
      method,
    }
  );
}


// ============================================================
// DURABLE OBJECT
// ============================================================

export class ChatRoom {
  constructor(
    state,
    env
  ) {
    this.state =
      state;

    this.env =
      env;

    this.sessions =
      new Set();
  }

  async fetch(
    request
  ) {
    if (
      request.headers.get(
        "Upgrade"
      ) !==
      "websocket"
    ) {
      return new Response(
        "Expected Upgrade: websocket",
        {
          status:
            426,
        }
      );
    }

    const pair =
      new WebSocketPair();

    const client =
      pair[0];

    const server =
      pair[1];

    server.accept();

    this.sessions.add(
      server
    );

    server.addEventListener(
      "message",
      event => {
        try {
          const data =
            JSON.parse(
              event.data
            );

          const message =
            JSON.stringify(
              {
                ...data,

                timestamp:
                  Date.now(),
              }
            );

          for (
            const session
            of this.sessions
          ) {
            if (
              session.readyState ===
              WebSocket.OPEN
            ) {
              session.send(
                message
              );
            }
          }
        } catch (
          err
        ) {
          server.send(
            JSON.stringify(
              {
                success:
                  false,

                error:
                  "INVALID_MESSAGE",

                message:
                  "رسالة WebSocket غير صحيحة",
              }
            )
          );
        }
      }
    );

    server.addEventListener(
      "close",
      () => {
        this.sessions.delete(
          server
        );
      }
    );

    server.addEventListener(
      "error",
      () => {
        this.sessions.delete(
          server
        );
      }
    );

    return new Response(
      null,
      {
        status:
          101,

        webSocket:
          client,
      }
    );
  }
}


// ============================================================
// WORKER ENTRY
// ============================================================

export default {
  async fetch(
    request,
    env
  ) {
    try {
      return await apiRouter(
        request,
        env
      );
    } catch (
      err
    ) {
      console.error(
        "NAJD API ERROR:",
        err
      );

      return error(
        "حدث خطأ داخلي في الخادم",
        "INTERNAL_SERVER_ERROR",
        500,
        {
          details:
            err.message,
        }
      );
    }
  },
};
