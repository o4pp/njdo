// ============================================================
// NAJD PLATFORM API
// Saudi Social Platform
// Cloudflare Workers
// D1 + R2 + Durable Objects + WebSocket
// Version 2.0.0
// ============================================================

const VERSION = "2.0.0";
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

  "Access-Control-Max-Age": "86400",
};


// ============================================================
// RESPONSE HELPERS
// ============================================================

function json(data, status = 200, headers = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          "application/json; charset=utf-8",
        ...headers,
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


function text(
  message,
  status = 200,
  contentType = "text/plain"
) {
  return new Response(
    message,
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          `${contentType}; charset=utf-8`,
      },
    }
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

  return pathname.replace(/\/+$/, "") || "/";
}


function getQuery(
  request,
  key,
  fallback = null
) {
  const url = new URL(request.url);

  return (
    url.searchParams.get(key) ||
    fallback
  );
}


function getPagination(request) {
  const url = new URL(request.url);

  let page = Number(
    url.searchParams.get("page") || 1
  );

  let limit = Number(
    url.searchParams.get("limit") || 20
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

  limit = Math.min(
    Math.floor(limit),
    50
  );

  page = Math.floor(page);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
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


function getCookie(
  request,
  name
) {
  const cookie =
    request.headers.get("Cookie");

  if (!cookie) {
    return null;
  }

  const parts =
    cookie.split(";");

  for (
    const part of parts
  ) {
    const [
      key,
      ...value
    ] =
      part.trim().split("=");

    if (key === name) {
      try {
        return decodeURIComponent(
          value.join("=")
        );
      } catch {
        return value.join("=");
      }
    }
  }

  return null;
}


function setCookie(
  name,
  value,
  options = {}
) {
  const {
    maxAge =
      60 * 60 * 24 * 30,

    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
  } = options;

  let cookie =
    `${name}=${encodeURIComponent(value)}`;

  cookie +=
    `; Max-Age=${maxAge}`;

  cookie +=
    `; Path=${path}`;

  if (httpOnly) {
    cookie += "; HttpOnly";
  }

  if (secure) {
    cookie += "; Secure";
  }

  if (sameSite) {
    cookie +=
      `; SameSite=${sameSite}`;
  }

  return cookie;
}


function clearCookie(name) {
  return setCookie(
    name,
    "",
    {
      maxAge: 0,
    }
  );
}


// ============================================================
// SECURITY / CRYPTO
// ============================================================

function randomBytes(
  length = 32
) {
  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  return bytes;
}


function bytesToHex(bytes) {
  return Array
    .from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
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


function bytesToBase64(bytes) {
  let binary = "";

  for (
    const byte of bytes
  ) {
    binary += String.fromCharCode(
      byte
    );
  }

  return btoa(binary);
}


async function sha256(value) {
  const data =
    new TextEncoder().encode(
      String(value)
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToHex(
    new Uint8Array(hash)
  );
}


async function hashPassword(
  password
) {
  const salt =
    randomBytes(16);

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        password
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

  return [
    "pbkdf2",
    "100000",
    bytesToHex(salt),
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
      ).split("$");

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
    ] = parts;

    if (
      algorithm !== "pbkdf2"
    ) {
      return false;
    }

    const iterations =
      Number(iterationsText);

    if (
      !Number.isInteger(
        iterations
      ) ||
      iterations < 1
    ) {
      return false;
    }

    const salt =
      hexToBytes(saltHex);

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(
          password
        ),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
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

    return timingSafeEqual(
      result,
      hashHex
    );
  } catch {
    return false;
  }
}


function timingSafeEqual(
  a,
  b
) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  if (
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}


function createId(
  prefix = ""
) {
  const id =
    bytesToHex(
      randomBytes(16)
    );

  return prefix
    ? `${prefix}_${id}`
    : id;
}


// ============================================================
// VALIDATION
// ============================================================

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
    .replace(/^@/, "");
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


function cleanText(
  value,
  max = 5000
) {
  return String(
    value ?? ""
  )
    .trim()
    .slice(0, max);
}


function validId(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 200
  );
}


// ============================================================
// DATABASE
// ============================================================

function assertDatabase(env) {
  if (
    !env ||
    !env.DB ||
    typeof env.DB.prepare !== "function"
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
// AUTHENTICATION
// ============================================================

async function createSession(
  env,
  userId,
  request
) {
  const token =
    bytesToBase64(
      randomBytes(48)
    );

  const tokenHash =
    await sha256(token);

  const sessionId =
    createId("session");

  const userAgent =
    request.headers.get(
      "User-Agent"
    ) || "";

  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) || "";

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        user_agent,
        ip_address,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      sessionId,
      userId,
      tokenHash,
      userAgent.slice(0, 500),
      ip.slice(0, 100),
      now +
        1000 *
        60 *
        60 *
        24 *
        30,
      now,
    ]
  );

  return token;
}


async function getCurrentUser(
  request,
  env
) {
  let token =
    getBearerToken(request);

  if (!token) {
    token =
      getCookie(
        request,
        "najd_session"
      );
  }

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(token);

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

      WHERE s.token_hash = ?
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
      ok: false,
      response: error(
        "يجب تسجيل الدخول أولًا",
        "UNAUTHORIZED",
        401
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}


// ============================================================
// USER SERIALIZATION
// ============================================================

function serializeUser(
  user
) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name:
      user.display_name,
    avatar_url:
      user.avatar_url,
    bio: user.bio,
    created_at:
      user.created_at,
  };
}


// ============================================================
// AUTH - REGISTER
// ============================================================

async function register(
  request,
  env
) {
  const body =
    await getJSON(request);

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

  if (!validUsername(username)) {
    return error(
      "اسم المستخدم يجب أن يحتوي على 3 إلى 30 حرفًا أو رقمًا",
      "INVALID_USERNAME",
      400
    );
  }

  if (!validPassword(password)) {
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
    if (
      existing.email === email
    ) {
      return error(
        "البريد الإلكتروني مستخدم مسبقًا",
        "EMAIL_EXISTS",
        409
      );
    }

    return error(
      "اسم المستخدم مستخدم مسبقًا",
      "USERNAME_EXISTS",
      409
    );
  }

  const id =
    createId("user");

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
      id,
      request
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
      [id]
    );

  const response =
    success(
      {
        message:
          "تم إنشاء الحساب بنجاح",
        user:
          serializeUser(user),
        token,
      },
      201
    );

  response.headers.append(
    "Set-Cookie",
    setCookie(
      "najd_session",
      token
    )
  );

  return response;
}


// ============================================================
// AUTH - LOGIN
// ============================================================

async function login(
  request,
  env
) {
  const body =
    await getJSON(request);

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
      "اسم المستخدم أو البريد وكلمة المرور مطلوبة",
      "MISSING_CREDENTIALS",
      400
    );
  }

  // إصلاح مهم:
  // وضع الأقواس حول email/username
  // حتى ينطبق deleted_at على الحالتين
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

  const now =
    Date.now();

  const token =
    await createSession(
      env,
      user.id,
      request
    );

  await dbRun(
    env,
    `
      UPDATE users

      SET
        last_login_at = ?,
        updated_at = ?

      WHERE id = ?
    `,
    [
      now,
      now,
      user.id,
    ]
  );

  const response =
    success({
      message:
        "تم تسجيل الدخول",
      user:
        serializeUser(user),
      token,
    });

  response.headers.append(
    "Set-Cookie",
    setCookie(
      "najd_session",
      token
    )
  );

  return response;
}


// ============================================================
// AUTH - LOGOUT
// ============================================================

async function logout(
  request,
  env
) {
  let token =
    getBearerToken(request);

  if (!token) {
    token =
      getCookie(
        request,
        "najd_session"
      );
  }

  if (token) {
    const tokenHash =
      await sha256(token);

    await dbRun(
      env,
      `
        DELETE FROM sessions
        WHERE token_hash = ?
      `,
      [tokenHash]
    );
  }

  const response =
    success({
      message:
        "تم تسجيل الخروج",
    });

  response.headers.append(
    "Set-Cookie",
    clearCookie(
      "najd_session"
    )
  );

  return response;
}


// ============================================================
// AUTH - ME
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

  return success({
    user:
      serializeUser(
        auth.user
      ),
  });
}


// ============================================================
// PROFILE
// ============================================================

async function getProfile(
  request,
  env,
  username
) {
  username =
    normalizeUsername(
      username
    );

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
            WHERE f.following_id = u.id
          ) AS followers_count,

          (
            SELECT COUNT(*)
            FROM followers f
            WHERE f.follower_id = u.id
          ) AS following_count,

          (
            SELECT COUNT(*)
            FROM snaps s
            WHERE s.user_id = u.id
            AND s.deleted_at IS NULL
          ) AS snaps_count

        FROM users u

        WHERE u.username = ?
        AND u.deleted_at IS NULL

        LIMIT 1
      `,
      [username]
    );

  if (!user) {
    return error(
      "المستخدم غير موجود",
      "USER_NOT_FOUND",
      404
    );
  }

  return success({
    user,
  });
}


async function updateProfile(
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
    await getJSON(request);

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const displayName =
    cleanText(
      body.display_name ||
      body.displayName ||
      auth.user.display_name,
      80
    );

  const bio =
    cleanText(
      body.bio,
      500
    );

  const avatarUrl =
    body.avatar_url !== undefined
      ? cleanText(
          body.avatar_url,
          2000
        )
      : auth.user.avatar_url;

  await dbRun(
    env,
    `
      UPDATE users

      SET
        display_name = ?,
        bio = ?,
        avatar_url = ?,
        updated_at = ?

      WHERE id = ?
    `,
    [
      displayName,
      bio,
      avatarUrl || null,
      Date.now(),
      auth.user.user_id,
    ]
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
        auth.user.user_id,
      ]
    );

  return success({
    message:
      "تم تحديث الملف الشخصي",
    user:
      serializeUser(user),
  });
}


// ============================================================
// FOLLOW
// ============================================================

async function followUser(
  request,
  env,
  targetUserId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  if (
    auth.user.user_id ===
    targetUserId
  ) {
    return error(
      "لا يمكنك متابعة نفسك",
      "INVALID_ACTION",
      400
    );
  }

  const target =
    await dbFirst(
      env,
      `
        SELECT id
        FROM users

        WHERE id = ?
        AND deleted_at IS NULL
      `,
      [targetUserId]
    );

  if (!target) {
    return error(
      "المستخدم غير موجود",
      "USER_NOT_FOUND",
      404
    );
  }

  const existing =
    await dbFirst(
      env,
      `
        SELECT
          follower_id

        FROM followers

        WHERE
          follower_id = ?
          AND following_id = ?
      `,
      [
        auth.user.user_id,
        targetUserId,
      ]
    );

  if (existing) {
    return success({
      following: true,
      message:
        "أنت تتابع هذا المستخدم بالفعل",
    });
  }

  await dbRun(
    env,
    `
      INSERT OR IGNORE INTO followers (
        follower_id,
        following_id,
        created_at
      )
      VALUES (?, ?, ?)
    `,
    [
      auth.user.user_id,
      targetUserId,
      Date.now(),
    ]
  );

  await createNotification(
    env,
    targetUserId,
    auth.user.user_id,
    "follow",
    null
  );

  return success({
    following: true,
  });
}


async function unfollowUser(
  request,
  env,
  targetUserId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  await dbRun(
    env,
    `
      DELETE FROM followers

      WHERE
        follower_id = ?
        AND following_id = ?
    `,
    [
      auth.user.user_id,
      targetUserId,
    ]
  );

  return success({
    following: false,
  });
}


// ============================================================
// SNAPS
// ============================================================

async function createSnap(
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
    await getJSON(request);

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
      5000
    );

  const visibility =
    cleanText(
      body.visibility ||
      "public",
      20
    );

  if (
    !mediaUrl &&
    !caption
  ) {
    return error(
      "يجب إضافة صورة أو فيديو أو نص",
      "EMPTY_SNAP",
      400
    );
  }

  if (
    ![
      "public",
      "followers",
      "private",
    ].includes(
      visibility
    )
  ) {
    return error(
      "نوع الخصوصية غير صحيح",
      "INVALID_VISIBILITY",
      400
    );
  }

  const id =
    createId("snap");

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO snaps (
        id,
        user_id,
        media_url,
        media_type,
        caption,
        visibility,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      auth.user.user_id,
      mediaUrl || null,
      mediaType || null,
      caption,
      visibility,
      now,
      now,
    ]
  );

  const snap =
    await getSnapById(
      env,
      id
    );

  return success(
    {
      message:
        "تم نشر السنابة",
      snap,
    },
    201
  );
}


async function getSnapById(
  env,
  snapId
) {
  return dbFirst(
    env,
    `
      SELECT
        s.id,
        s.user_id,
        s.media_url,
        s.media_type,
        s.caption,
        s.visibility,
        s.created_at,

        u.username,
        u.display_name,
        u.avatar_url,

        (
          SELECT COUNT(*)
          FROM likes l
          WHERE l.snap_id = s.id
        ) AS likes_count,

        (
          SELECT COUNT(*)
          FROM comments c
          WHERE c.snap_id = s.id
          AND c.deleted_at IS NULL
        ) AS comments_count

      FROM snaps s

      INNER JOIN users u
        ON u.id = s.user_id

      WHERE s.id = ?
      AND s.deleted_at IS NULL

      LIMIT 1
    `,
    [snapId]
  );
}


async function getFeed(
  request,
  env
) {
  const authUser =
    await getCurrentUser(
      request,
      env
    );

  const {
    limit,
    offset,
  } =
    getPagination(request);

  let query = `
    SELECT
      s.id,
      s.user_id,
      s.media_url,
      s.media_type,
      s.caption,
      s.visibility,
      s.created_at,

      u.username,
      u.display_name,
      u.avatar_url,

      (
        SELECT COUNT(*)
        FROM likes l
        WHERE l.snap_id = s.id
      ) AS likes_count,

      (
        SELECT COUNT(*)
        FROM comments c
        WHERE c.snap_id = s.id
        AND c.deleted_at IS NULL
      ) AS comments_count
  `;

  const params = [];

  if (authUser) {
    query += `
      ,

      EXISTS (
        SELECT 1
        FROM likes ml

        WHERE ml.snap_id = s.id
        AND ml.user_id = ?
      ) AS liked
    `;

    params.push(
      authUser.user_id
    );
  }

  query += `
    FROM snaps s

    INNER JOIN users u
      ON u.id = s.user_id

    WHERE
      s.deleted_at IS NULL
      AND u.deleted_at IS NULL

      AND (
        s.visibility = 'public'
  `;

  if (authUser) {
    query += `
        OR s.user_id = ?

        OR (
          s.visibility = 'followers'

          AND EXISTS (
            SELECT 1
            FROM followers f

            WHERE
              f.follower_id = ?
              AND f.following_id = s.user_id
          )
        )
    `;

    params.push(
      authUser.user_id,
      authUser.user_id
    );
  }

  query += `
      )

    ORDER BY s.created_at DESC

    LIMIT ?
    OFFSET ?
  `;

  params.push(
    limit,
    offset
  );

  const snaps =
    await dbAll(
      env,
      query,
      params
    );

  return success({
    snaps,
    pagination: {
      page:
        Math.floor(
          offset / limit
        ) + 1,
      limit,
      offset,
    },
  });
}


async function deleteSnap(
  request,
  env,
  snapId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const snap =
    await dbFirst(
      env,
      `
        SELECT
          id,
          user_id

        FROM snaps

        WHERE id = ?
        AND deleted_at IS NULL
      `,
      [snapId]
    );

  if (!snap) {
    return error(
      "السنابة غير موجودة",
      "SNAP_NOT_FOUND",
      404
    );
  }

  if (
    snap.user_id !==
    auth.user.user_id
  ) {
    return error(
      "لا تملك صلاحية حذف هذه السنابة",
      "FORBIDDEN",
      403
    );
  }

  const now =
    Date.now();

  await dbRun(
    env,
    `
      UPDATE snaps

      SET
        deleted_at = ?,
        updated_at = ?

      WHERE id = ?
    `,
    [
      now,
      now,
      snapId,
    ]
  );

  return success({
    message:
      "تم حذف السنابة",
  });
}


// ============================================================
// STORIES
// ============================================================

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
    await getJSON(request);

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
    createId("story");

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


async function getStories(
  request,
  env
) {
  const now =
    Date.now();

  const stories =
    await dbAll(
      env,
      `
        SELECT
          st.id,
          st.user_id,
          st.media_url,
          st.media_type,
          st.caption,
          st.expires_at,
          st.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM stories st

        INNER JOIN users u
          ON u.id = st.user_id

        WHERE
          st.expires_at > ?
          AND u.deleted_at IS NULL

        ORDER BY
          st.created_at DESC
      `,
      [now]
    );

  return success({
    stories,
  });
}


async function deleteStory(
  request,
  env,
  storyId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const story =
    await dbFirst(
      env,
      `
        SELECT
          id,
          user_id

        FROM stories

        WHERE id = ?
      `,
      [storyId]
    );

  if (!story) {
    return error(
      "القصة غير موجودة",
      "STORY_NOT_FOUND",
      404
    );
  }

  if (
    story.user_id !==
    auth.user.user_id
  ) {
    return error(
      "لا تملك صلاحية حذف هذه القصة",
      "FORBIDDEN",
      403
    );
  }

  await dbRun(
    env,
    `
      DELETE FROM stories
      WHERE id = ?
    `,
    [storyId]
  );

  return success({
    message:
      "تم حذف القصة",
  });
}


// ============================================================
// LIKES
// ============================================================

async function likeSnap(
  request,
  env,
  snapId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const snap =
    await dbFirst(
      env,
      `
        SELECT
          id,
          user_id

        FROM snaps

        WHERE id = ?
        AND deleted_at IS NULL
      `,
      [snapId]
    );

  if (!snap) {
    return error(
      "السنابة غير موجودة",
      "SNAP_NOT_FOUND",
      404
    );
  }

  await dbRun(
    env,
    `
      INSERT OR IGNORE INTO likes (
        user_id,
        snap_id,
        created_at
      )
      VALUES (?, ?, ?)
    `,
    [
      auth.user.user_id,
      snapId,
      Date.now(),
    ]
  );

  const existing =
    await dbFirst(
      env,
      `
        SELECT
          user_id

        FROM likes

        WHERE
          user_id = ?
          AND snap_id = ?
      `,
      [
        auth.user.user_id,
        snapId,
      ]
    );

  if (
    existing &&
    snap.user_id !==
      auth.user.user_id
  ) {
    await createNotification(
      env,
      snap.user_id,
      auth.user.user_id,
      "like",
      snapId
    );
  }

  return success({
    liked: true,
  });
}


async function unlikeSnap(
  request,
  env,
  snapId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  await dbRun(
    env,
    `
      DELETE FROM likes

      WHERE
        user_id = ?
        AND snap_id = ?
    `,
    [
      auth.user.user_id,
      snapId,
    ]
  );

  return success({
    liked: false,
  });
}


// ============================================================
// COMMENTS
// ============================================================

async function createComment(
  request,
  env,
  snapId
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
    await getJSON(request);

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const content =
    cleanText(
      body.content,
      1000
    );

  if (!content) {
    return error(
      "التعليق فارغ",
      "EMPTY_COMMENT",
      400
    );
  }

  const snap =
    await dbFirst(
      env,
      `
        SELECT
          id,
          user_id

        FROM snaps

        WHERE id = ?
        AND deleted_at IS NULL
      `,
      [snapId]
    );

  if (!snap) {
    return error(
      "السنابة غير موجودة",
      "SNAP_NOT_FOUND",
      404
    );
  }

  const id =
    createId("comment");

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO comments (
        id,
        snap_id,
        user_id,
        content,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      id,
      snapId,
      auth.user.user_id,
      content,
      now,
    ]
  );

  if (
    snap.user_id !==
    auth.user.user_id
  ) {
    await createNotification(
      env,
      snap.user_id,
      auth.user.user_id,
      "comment",
      snapId
    );
  }

  const comment =
    await dbFirst(
      env,
      `
        SELECT
          c.id,
          c.snap_id,
          c.user_id,
          c.content,
          c.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM comments c

        INNER JOIN users u
          ON u.id = c.user_id

        WHERE c.id = ?
      `,
      [id]
    );

  return success(
    {
      comment,
    },
    201
  );
}


async function getComments(
  request,
  env,
  snapId
) {
  const {
    limit,
    offset,
  } =
    getPagination(request);

  const comments =
    await dbAll(
      env,
      `
        SELECT
          c.id,
          c.snap_id,
          c.user_id,
          c.content,
          c.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM comments c

        INNER JOIN users u
          ON u.id = c.user_id

        WHERE
          c.snap_id = ?
          AND c.deleted_at IS NULL

        ORDER BY
          c.created_at ASC

        LIMIT ?
        OFFSET ?
      `,
      [
        snapId,
        limit,
        offset,
      ]
    );

  return success({
    comments,
    pagination: {
      limit,
      offset,
    },
  });
}


// ============================================================
// SEARCH
// ============================================================

async function search(
  request,
  env
) {
  const q =
    cleanText(
      getQuery(
        request,
        "q",
        ""
      ),
      100
    );

  if (
    q.length < 2
  ) {
    return success({
      users: [],
      snaps: [],
    });
  }

  const searchTerm =
    `%${q}%`;

  const users =
    await dbAll(
      env,
      `
        SELECT
          id,
          username,
          display_name,
          avatar_url,
          bio

        FROM users

        WHERE
          deleted_at IS NULL

          AND (
            username LIKE ?
            OR display_name LIKE ?
          )

        ORDER BY
          username ASC

        LIMIT 20
      `,
      [
        searchTerm,
        searchTerm,
      ]
    );

  const snaps =
    await dbAll(
      env,
      `
        SELECT
          s.id,
          s.user_id,
          s.media_url,
          s.media_type,
          s.caption,
          s.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM snaps s

        INNER JOIN users u
          ON u.id = s.user_id

        WHERE
          s.deleted_at IS NULL
          AND s.visibility = 'public'
          AND s.caption LIKE ?

        ORDER BY
          s.created_at DESC

        LIMIT 20
      `,
      [searchTerm]
    );

  return success({
    users,
    snaps,
  });
}


// ============================================================
// NOTIFICATIONS
// ============================================================

async function createNotification(
  env,
  recipientId,
  actorId,
  type,
  referenceId
) {
  if (
    recipientId === actorId
  ) {
    return;
  }

  await dbRun(
    env,
    `
      INSERT INTO notifications (
        id,
        recipient_id,
        actor_id,
        type,
        reference_id,
        is_read,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      createId(
        "notification"
      ),
      recipientId,
      actorId,
      type,
      referenceId,
      0,
      Date.now(),
    ]
  );
}


async function getNotifications(
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

  const {
    limit,
    offset,
  } =
    getPagination(request);

  const notifications =
    await dbAll(
      env,
      `
        SELECT
          n.id,
          n.type,
          n.reference_id,
          n.is_read,
          n.created_at,

          u.id AS actor_id,
          u.username AS actor_username,
          u.display_name AS actor_display_name,
          u.avatar_url AS actor_avatar_url

        FROM notifications n

        INNER JOIN users u
          ON u.id = n.actor_id

        WHERE
          n.recipient_id = ?

        ORDER BY
          n.created_at DESC

        LIMIT ?
        OFFSET ?
      `,
      [
        auth.user.user_id,
        limit,
        offset,
      ]
    );

  return success({
    notifications,
  });
}


async function markNotificationsRead(
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

  await dbRun(
    env,
    `
      UPDATE notifications

      SET is_read = 1

      WHERE recipient_id = ?
    `,
    [
      auth.user.user_id,
    ]
  );

  return success({
    message:
      "تم تحديث الإشعارات",
  });
}


// ============================================================
// CONVERSATIONS
// ============================================================

async function createConversation(
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
    await getJSON(request);

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const memberIds =
    Array.isArray(
      body.member_ids
    )
      ? body.member_ids
      : [];

  const uniqueMembers =
    [
      ...new Set(
        [
          auth.user.user_id,
          ...memberIds,
        ]
          .filter(
            validId
          )
      ),
    ];

  if (
    uniqueMembers.length < 2
  ) {
    return error(
      "يجب إضافة مستخدم آخر",
      "INVALID_MEMBERS",
      400
    );
  }

  const placeholders =
    uniqueMembers
      .map(
        () => "?"
      )
      .join(",");

  const users =
    await dbAll(
      env,
      `
        SELECT id
        FROM users

        WHERE
          id IN (${placeholders})
          AND deleted_at IS NULL
      `,
      uniqueMembers
    );

  if (
    users.length !==
    uniqueMembers.length
  ) {
    return error(
      "أحد المستخدمين غير موجود",
      "INVALID_MEMBER",
      404
    );
  }

  const type =
    uniqueMembers.length === 2
      ? "direct"
      : "group";

  const conversationId =
    createId(
      "conversation"
    );

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO conversations (
        id,
        type,
        created_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      conversationId,
      type,
      auth.user.user_id,
      now,
      now,
    ]
  );

  for (
    const userId
    of uniqueMembers
  ) {
    await dbRun(
      env,
      `
        INSERT INTO conversation_members (
          conversation_id,
          user_id,
          joined_at
        )
        VALUES (?, ?, ?)
      `,
      [
        conversationId,
        userId,
        now,
      ]
    );
  }

  return success(
    {
      conversation: {
        id:
          conversationId,
        type,
        members:
          uniqueMembers,
        created_at:
          now,
      },
    },
    201
  );
}


async function getConversations(
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

  const conversations =
    await dbAll(
      env,
      `
        SELECT
          c.id,
          c.type,
          c.created_at,
          c.updated_at,

          (
            SELECT m.content
            FROM messages m

            WHERE
              m.conversation_id = c.id
              AND m.deleted_at IS NULL

            ORDER BY
              m.created_at DESC

            LIMIT 1
          ) AS last_message,

          (
            SELECT m.created_at
            FROM messages m

            WHERE
              m.conversation_id = c.id
              AND m.deleted_at IS NULL

            ORDER BY
              m.created_at DESC

            LIMIT 1
          ) AS last_message_at

        FROM conversations c

        INNER JOIN conversation_members cm
          ON cm.conversation_id = c.id

        WHERE
          cm.user_id = ?

        ORDER BY
          COALESCE(
            last_message_at,
            c.updated_at
          ) DESC
      `,
      [
        auth.user.user_id,
      ]
    );

  for (
    const conversation
    of conversations
  ) {
    conversation.members =
      await dbAll(
        env,
        `
          SELECT
            u.id,
            u.username,
            u.display_name,
            u.avatar_url

          FROM conversation_members cm

          INNER JOIN users u
            ON u.id = cm.user_id

          WHERE
            cm.conversation_id = ?
        `,
        [
          conversation.id,
        ]
      );
  }

  return success({
    conversations,
  });
}


async function getConversationMessages(
  request,
  env,
  conversationId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const member =
    await dbFirst(
      env,
      `
        SELECT
          conversation_id

        FROM conversation_members

        WHERE
          conversation_id = ?
          AND user_id = ?
      `,
      [
        conversationId,
        auth.user.user_id,
      ]
    );

  if (!member) {
    return error(
      "لا تملك صلاحية الوصول إلى هذه المحادثة",
      "FORBIDDEN",
      403
    );
  }

  const {
    limit,
    offset,
  } =
    getPagination(request);

  const messages =
    await dbAll(
      env,
      `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.content,
          m.media_url,
          m.media_type,
          m.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM messages m

        INNER JOIN users u
          ON u.id = m.sender_id

        WHERE
          m.conversation_id = ?
          AND m.deleted_at IS NULL

        ORDER BY
          m.created_at DESC

        LIMIT ?
        OFFSET ?
      `,
      [
        conversationId,
        limit,
        offset,
      ]
    );

  return success({
    messages:
      messages.reverse(),
  });
}


async function sendMessage(
  request,
  env,
  conversationId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const member =
    await dbFirst(
      env,
      `
        SELECT
          conversation_id

        FROM conversation_members

        WHERE
          conversation_id = ?
          AND user_id = ?
      `,
      [
        conversationId,
        auth.user.user_id,
      ]
    );

  if (!member) {
    return error(
      "لا تملك صلاحية الوصول إلى هذه المحادثة",
      "FORBIDDEN",
      403
    );
  }

  const body =
    await getJSON(request);

  if (!body) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON",
      400
    );
  }

  const content =
    cleanText(
      body.content,
      5000
    );

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

  if (
    !content &&
    !mediaUrl
  ) {
    return error(
      "الرسالة فارغة",
      "EMPTY_MESSAGE",
      400
    );
  }

  const id =
    createId("message");

  const now =
    Date.now();

  await dbRun(
    env,
    `
      INSERT INTO messages (
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      conversationId,
      auth.user.user_id,
      content,
      mediaUrl || null,
      mediaType || null,
      now,
    ]
  );

  await dbRun(
    env,
    `
      UPDATE conversations

      SET updated_at = ?

      WHERE id = ?
    `,
    [
      now,
      conversationId,
    ]
  );

  const message =
    await dbFirst(
      env,
      `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.content,
          m.media_url,
          m.media_type,
          m.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM messages m

        INNER JOIN users u
          ON u.id = m.sender_id

        WHERE
          m.id = ?
      `,
      [id]
    );

  return success(
    {
      message,
    },
    201
  );
}


// ============================================================
// R2 UPLOAD
// ============================================================

async function uploadMedia(
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

  if (
    !env.MEDIA ||
    typeof env.MEDIA.put !==
      "function"
  ) {
    return error(
      "R2 غير مربوط في Worker",
      "R2_NOT_CONFIGURED",
      500
    );
  }

  const contentType =
    request.headers.get(
      "Content-Type"
    ) || "";

  if (
    !contentType.includes(
      "multipart/form-data"
    )
  ) {
    return error(
      "يجب إرسال multipart/form-data",
      "INVALID_UPLOAD",
      400
    );
  }

  let formData;

  try {
    formData =
      await request.formData();
  } catch {
    return error(
      "تعذر قراءة الملف",
      "INVALID_FORM_DATA",
      400
    );
  }

  const file =
    formData.get("file");

  if (
    !file ||
    typeof file.arrayBuffer !==
      "function"
  ) {
    return error(
      "الملف غير موجود",
      "FILE_REQUIRED",
      400
    );
  }

  const maxSize =
    100 *
    1024 *
    1024;

  if (
    file.size > maxSize
  ) {
    return error(
      "حجم الملف يتجاوز 100MB",
      "FILE_TOO_LARGE",
      413
    );
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "application/pdf",
  ];

  if (
    !allowedTypes.includes(
      file.type
    )
  ) {
    return error(
      "نوع الملف غير مدعوم",
      "UNSUPPORTED_FILE_TYPE",
      415
    );
  }

  const extension =
    getExtension(
      file.name,
      file.type
    );

  const key =
    [
      "users",
      auth.user.user_id,
      new Date()
        .getUTCFullYear(),
      createId(
        "media"
      ) + extension,
    ].join("/");

  const arrayBuffer =
    await file.arrayBuffer();

  await env.MEDIA.put(
    key,
    arrayBuffer,
    {
      httpMetadata: {
        contentType:
          file.type,
      },

      customMetadata: {
        userId:
          auth.user.user_id,

        originalName:
          String(
            file.name || ""
          ).slice(
            0,
            500
          ),
      },
    }
  );

  const publicBaseUrl =
    cleanText(
      env.MEDIA_PUBLIC_URL,
      2000
    );

  const url =
    publicBaseUrl
      ? `${publicBaseUrl.replace(
          /\/$/,
          ""
        )}/${key}`
      : `/media/${key}`;

  return success(
    {
      key,
      url,
      type:
        file.type,
      size:
        file.size,
    },
    201
  );
}


function getExtension(
  filename,
  contentType
) {
  const known = {
    "image/jpeg":
      ".jpg",

    "image/png":
      ".png",

    "image/webp":
      ".webp",

    "image/gif":
      ".gif",

    "video/mp4":
      ".mp4",

    "video/webm":
      ".webm",

    "application/pdf":
      ".pdf",
  };

  const match =
    String(
      filename || ""
    ).match(
      /\.[a-zA-Z0-9]+$/
    );

  return match
    ? match[0].toLowerCase()
    : known[contentType] || "";
}


// ============================================================
// R2 MEDIA
// ============================================================

async function getMedia(
  request,
  env,
  key
) {
  if (
    !env.MEDIA ||
    typeof env.MEDIA.get !==
      "function"
  ) {
    return error(
      "R2 غير مربوط",
      "R2_NOT_CONFIGURED",
      500
    );
  }

  const safeKey =
    decodeURIComponent(
      key
    );

  const object =
    await env.MEDIA.get(
      safeKey
    );

  if (!object) {
    return error(
      "الملف غير موجود",
      "MEDIA_NOT_FOUND",
      404
    );
  }

  const headers =
    new Headers(
      CORS_HEADERS
    );

  object.writeHttpMetadata(
    headers
  );

  headers.set(
    "ETag",
    object.httpEtag
  );

  headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable"
  );

  return new Response(
    object.body,
    {
      headers,
    }
  );
}


// ============================================================
// WEBSOCKET ROUTE
// ============================================================

async function handleWebSocket(
  request,
  env,
  conversationId
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  const member =
    await dbFirst(
      env,
      `
        SELECT
          conversation_id

        FROM conversation_members

        WHERE
          conversation_id = ?
          AND user_id = ?
      `,
      [
        conversationId,
        auth.user.user_id,
      ]
    );

  if (!member) {
    return error(
      "لا تملك صلاحية الوصول للمحادثة",
      "FORBIDDEN",
      403
    );
  }

  if (
    !env.CHAT_ROOMS ||
    typeof env.CHAT_ROOMS.idFromName !==
      "function"
  ) {
    return error(
      "Durable Objects غير مهيأة",
      "DO_NOT_CONFIGURED",
      500
    );
  }

  const id =
    env.CHAT_ROOMS.idFromName(
      conversationId
    );

  const stub =
    env.CHAT_ROOMS.get(id);

  const headers =
    new Headers(
      request.headers
    );

  headers.set(
    "X-NAJD-USER-ID",
    auth.user.user_id
  );

  headers.set(
    "X-NAJD-USERNAME",
    auth.user.username
  );

  const upgradedRequest =
    new Request(
      request,
      {
        headers,
      }
    );

  return stub.fetch(
    new Request(
      `https://chat.internal/ws/${conversationId}`,
      upgradedRequest
    )
  );
}


// ============================================================
// HEALTH
// ============================================================

async function health(
  env
) {
  let database =
    "unknown";

  try {
    assertDatabase(env);

    await env.DB
      .prepare(
        "SELECT 1 AS ok"
      )
      .first();

    database =
      "connected";
  } catch {
    database =
      "error";
  }

  return success({
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
        Boolean(
          env.MEDIA
        ),

      durable_objects:
        Boolean(
          env.CHAT_ROOMS
        ),
    },

    timestamp:
      new Date()
        .toISOString(),
  });
}


// ============================================================
// API ROUTER
// ============================================================

async function apiRouter(
  request,
  env
) {
  const method =
    request.method;

  const path =
    getPath(request);


  // ==========================================================
  // HEALTH
  // ==========================================================

  if (
    method === "GET" &&
    (
      path === "/" ||
      path === "/api" ||
      path === "/health"
    )
  ) {
    return health(env);
  }


  // ==========================================================
  // AUTH
  // ==========================================================

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


  // ==========================================================
  // PROFILE
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/profile"
  ) {
    const auth =
      await requireAuth(
        request,
        env
      );

    if (!auth.ok) {
      return auth.response;
    }

    return getProfile(
      request,
      env,
      auth.user.username
    );
  }

  if (
    method === "PUT" &&
    path ===
      "/api/profile"
  ) {
    return updateProfile(
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
      request,
      env,
      profileMatch[1]
    );
  }


  // ==========================================================
  // FOLLOW
  // ==========================================================

  const followMatch =
    path.match(
      /^\/api\/users\/([^/]+)\/follow$/
    );

  if (
    method === "POST" &&
    followMatch
  ) {
    return followUser(
      request,
      env,
      followMatch[1]
    );
  }

  if (
    method === "DELETE" &&
    followMatch
  ) {
    return unfollowUser(
      request,
      env,
      followMatch[1]
    );
  }


  // ==========================================================
  // FEED
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/feed"
  ) {
    return getFeed(
      request,
      env
    );
  }


  // ==========================================================
  // SNAPS
  // ==========================================================

  if (
    method === "POST" &&
    path ===
      "/api/snaps"
  ) {
    return createSnap(
      request,
      env
    );
  }

  const snapMatch =
    path.match(
      /^\/api\/snaps\/([^/]+)$/
    );

  if (
    method === "DELETE" &&
    snapMatch
  ) {
    return deleteSnap(
      request,
      env,
      snapMatch[1]
    );
  }


  // ==========================================================
  // LIKES
  // ==========================================================

  const likeMatch =
    path.match(
      /^\/api\/snaps\/([^/]+)\/like$/
    );

  if (
    method === "POST" &&
    likeMatch
  ) {
    return likeSnap(
      request,
      env,
      likeMatch[1]
    );
  }

  if (
    method === "DELETE" &&
    likeMatch
  ) {
    return unlikeSnap(
      request,
      env,
      likeMatch[1]
    );
  }


  // ==========================================================
  // COMMENTS
  // ==========================================================

  const commentsMatch =
    path.match(
      /^\/api\/snaps\/([^/]+)\/comments$/
    );

  if (
    method === "GET" &&
    commentsMatch
  ) {
    return getComments(
      request,
      env,
      commentsMatch[1]
    );
  }

  if (
    method === "POST" &&
    commentsMatch
  ) {
    return createComment(
      request,
      env,
      commentsMatch[1]
    );
  }


  // ==========================================================
  // STORIES
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/stories"
  ) {
    return getStories(
      request,
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

  const storyMatch =
    path.match(
      /^\/api\/stories\/([^/]+)$/
    );

  if (
    method === "DELETE" &&
    storyMatch
  ) {
    return deleteStory(
      request,
      env,
      storyMatch[1]
    );
  }


  // ==========================================================
  // SEARCH
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/search"
  ) {
    return search(
      request,
      env
    );
  }


  // ==========================================================
  // NOTIFICATIONS
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/notifications"
  ) {
    return getNotifications(
      request,
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/notifications/read"
  ) {
    return markNotificationsRead(
      request,
      env
    );
  }


  // ==========================================================
  // CONVERSATIONS
  // ==========================================================

  if (
    method === "GET" &&
    path ===
      "/api/conversations"
  ) {
    return getConversations(
      request,
      env
    );
  }

  if (
    method === "POST" &&
    path ===
      "/api/conversations"
  ) {
    return createConversation(
      request,
      env
    );
  }

  const conversationMessagesMatch =
    path.match(
      /^\/api\/conversations\/([^/]+)\/messages$/
    );

  if (
    method === "GET" &&
    conversationMessagesMatch
  ) {
    return getConversationMessages(
      request,
      env,
      conversationMessagesMatch[1]
    );
  }

  if (
    method === "POST" &&
    conversationMessagesMatch
  ) {
    return sendMessage(
      request,
      env,
      conversationMessagesMatch[1]
    );
  }


  // ==========================================================
  // WEBSOCKET
  // ==========================================================

  const websocketMatch =
    path.match(
      /^\/ws\/chat\/([^/]+)$/
    );

  if (
    method === "GET" &&
    websocketMatch &&
    request.headers
      .get("Upgrade")
      ?.toLowerCase() ===
      "websocket"
  ) {
    return handleWebSocket(
      request,
      env,
      websocketMatch[1]
    );
  }


  // ==========================================================
  // UPLOAD
  // ==========================================================

  if (
    method === "POST" &&
    path ===
      "/api/upload"
  ) {
    return uploadMedia(
      request,
      env
    );
  }


  // ==========================================================
  // R2 MEDIA
  // ==========================================================

  const mediaMatch =
    path.match(
      /^\/media\/(.+)$/
    );

  if (
    method === "GET" &&
    mediaMatch
  ) {
    return getMedia(
      request,
      env,
      mediaMatch[1]
    );
  }


  // ==========================================================
  // NOT FOUND
  // ==========================================================

  return error(
    "Endpoint not found",
    "NOT_FOUND",
    404,
    {
      path,
      method,
    }
  );
}


// ============================================================
// GLOBAL WORKER
// ============================================================

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    try {
      if (
        request.method ===
        "OPTIONS"
      ) {
        return new Response(
          null,
          {
            status: 204,
            headers:
              CORS_HEADERS,
          }
        );
      }

      return await apiRouter(
        request,
        env
      );
    } catch (err) {
      console.error(
        "NAJD API ERROR:",
        err
      );

      return error(
        "حدث خطأ داخلي في الخادم",
        "INTERNAL_SERVER_ERROR",
        500,
        env.ENVIRONMENT ===
          "development"
          ? {
              details:
                String(
                  err?.message ||
                  err
                ),
            }
          : {}
      );
    }
  },
};


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

    this.ctx =
      state;
  }


  async fetch(
    request
  ) {
    if (
      request.headers
        .get("Upgrade")
        ?.toLowerCase() !==
      "websocket"
    ) {
      return new Response(
        "WebSocket Required",
        {
          status: 426,
        }
      );
    }

    const pair =
      new WebSocketPair();

    const [
      client,
      server,
    ] =
      Object.values(
        pair
      );

    const userId =
      request.headers.get(
        "X-NAJD-USER-ID"
      );

    const username =
      request.headers.get(
        "X-NAJD-USERNAME"
      );

    const sessionId =
      createId(
        "socket"
      );

    // WebSocket Hibernation API
    this.ctx.acceptWebSocket(
      server
    );

    server.serializeAttachment({
      sessionId,
      userId,
      username,
      joinedAt:
        Date.now(),
    });

    server.send(
      JSON.stringify({
        type:
          "connected",

        session_id:
          sessionId,

        user_id:
          userId,

        username,

        timestamp:
          Date.now(),
      })
    );

    this.broadcast(
      {
        type:
          "presence",

        status:
          "online",

        user_id:
          userId,

        username,
      },
      server
    );

    return new Response(
      null,
      {
        status: 101,
        webSocket:
          client,
      }
    );
  }


  webSocketMessage(
    ws,
    message
  ) {
    const attachment =
      ws.deserializeAttachment();

    const userId =
      attachment?.userId ||
      null;

    const username =
      attachment?.username ||
      null;

    let data;

    try {
      data =
        typeof message ===
          "string"
          ? JSON.parse(
              message
            )
          : JSON.parse(
              new TextDecoder()
                .decode(
                  message
                )
            );
    } catch {
      ws.send(
        JSON.stringify({
          type:
            "error",

          message:
            "Invalid JSON",
        })
      );

      return;
    }

    if (
      data.type ===
      "ping"
    ) {
      ws.send(
        JSON.stringify({
          type:
            "pong",

          timestamp:
            Date.now(),
        })
      );

      return;
    }

    if (
      data.type ===
      "typing"
    ) {
      this.broadcast(
        {
          type:
            "typing",

          user_id:
            userId,

          username,

          is_typing:
            Boolean(
              data.is_typing
            ),
        },
        ws
      );

      return;
    }

    if (
      data.type ===
      "message"
    ) {
      const content =
        cleanText(
          data.content,
          5000
        );

      if (!content) {
        return;
      }

      this.broadcast(
        {
          type:
            "message",

          id:
            createId(
              "realtime"
            ),

          user_id:
            userId,

          username,

          content,

          timestamp:
            Date.now(),
        }
      );
    }
  }


  webSocketClose(
    ws,
    code,
    reason
  ) {
    const attachment =
      ws.deserializeAttachment();

    if (
      attachment
    ) {
      this.broadcast(
        {
          type:
            "presence",

          status:
            "offline",

          user_id:
            attachment.userId,

          username:
            attachment.username,
        },
        ws
      );
    }

    try {
      ws.close(
        code || 1000,
        reason ||
          "Connection closed"
      );
    } catch {
      // Already closed
    }
  }


  webSocketError(
    ws
  ) {
    try {
      ws.close(
        1011,
        "WebSocket error"
      );
    } catch {
      // Ignore
    }
  }


  broadcast(
    message,
    except = null
  ) {
    const payload =
      JSON.stringify(
        message
      );

    const sockets =
      this.ctx.getWebSockets();

    for (
      const socket
      of sockets
    ) {
      if (
        socket ===
        except
      ) {
        continue;
      }

      try {
        socket.send(
          payload
        );
      } catch {
        try {
          socket.close(
            1011,
            "Broadcast failed"
          );
        } catch {
          // Ignore
        }
      }
    }
  }
}
