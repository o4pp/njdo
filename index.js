// ============================================================
// NAJD PLATFORM API
// Saudi Social Platform
// Cloudflare Workers
// D1 + Durable Objects + WebSocket
// NO R2
// Version 3.0.0
// ============================================================

const VERSION = "3.0.0";
const API_NAME = "NAJD API";


// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",

  "Access-Control-Max-Age":
    "86400",
};


// ============================================================
// RESPONSE HELPERS
// ============================================================

function json(
  data,
  status = 200,
  headers = {}
) {
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


function success(
  data = {},
  status = 200
) {
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

async function getJSON(
  request
) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}


function getPath(
  request
) {
  const url =
    new URL(request.url);

  return (
    url.pathname
      .replace(/\/+$/, "") ||
    "/"
  );
}


function getQuery(
  request,
  key,
  fallback = null
) {
  const url =
    new URL(request.url);

  return (
    url.searchParams.get(key) ||
    fallback
  );
}


function getPagination(
  request
) {
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


function getBearerToken(
  request
) {
  const header =
    request.headers.get(
      "Authorization"
    );

  if (
    !header
  ) {
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


function normalizeEmail(
  email
) {
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


function validEmail(
  email
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);
}


function validUsername(
  username
) {
  return /^[a-zA-Z0-9_]{3,30}$/
    .test(username);
}


function validId(
  value
) {
  return (
    typeof value ===
      "string" &&
    value.length >= 8 &&
    value.length <= 200
  );
}


function createId(
  prefix = ""
) {
  const id =
    crypto.randomUUID();

  return prefix
    ? `${prefix}_${id}`
    : id;
}


// ============================================================
// DATABASE HELPERS
// ============================================================

function assertDatabase(
  env
) {
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

  return (
    result.results || []
  );
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
// PASSWORD HASHING
// ============================================================

async function hashPassword(
  password
) {
  const data =
    new TextEncoder()
      .encode(
        String(password)
      );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


// ============================================================
// AUTH
// ============================================================

async function createSession(
  env,
  userId,
  request
) {
  const token =
    crypto.randomUUID() +
    crypto.randomUUID();

  const tokenHash =
    await hashPassword(
      token
    );

  const sessionId =
    createId("session");

  const now =
    Date.now();

  const expiresAt =
    now +
    30 *
    24 *
    60 *
    60 *
    1000;

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

      (
        request.headers.get(
          "User-Agent"
        ) || ""
      ).slice(0, 500),

      (
        request.headers.get(
          "CF-Connecting-IP"
        ) || ""
      ).slice(0, 100),

      expiresAt,

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

  if (
    !token
  ) {
    return null;
  }

  const tokenHash =
    await hashPassword(
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

  if (
    !user
  ) {
    return {
      ok: false,

      response:
        error(
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
  if (
    !user
  ) {
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

  if (
    !body
  ) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON"
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
    String(
      body.password ||
      ""
    );

  const displayName =
    cleanText(
      body.display_name ||
      body.displayName ||
      username,
      80
    );

  if (
    !validEmail(
      email
    )
  ) {
    return error(
      "البريد الإلكتروني غير صحيح",
      "INVALID_EMAIL"
    );
  }

  if (
    !validUsername(
      username
    )
  ) {
    return error(
      "اسم المستخدم يجب أن يحتوي على 3 إلى 30 حرفًا أو رقمًا",
      "INVALID_USERNAME"
    );
  }

  if (
    password.length <
    8
  ) {
    return error(
      "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
      "WEAK_PASSWORD"
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

  if (
    existing
  ) {
    if (
      existing.email ===
      email
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
        updated_at,
        deleted_at
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      null,
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
      [
        id,
      ]
    );

  return success(
    {
      message:
        "تم إنشاء الحساب بنجاح",

      user:
        serializeUser(
          user
        ),

      token,
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

  if (
    !body
  ) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON"
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
    String(
      body.password ||
      ""
    );

  if (
    !identifier ||
    !password
  ) {
    return error(
      "بيانات الدخول مطلوبة",
      "MISSING_CREDENTIALS"
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

  if (
    !user
  ) {
    return error(
      "بيانات الدخول غير صحيحة",
      "INVALID_CREDENTIALS",
      401
    );
  }

  const valid =
    await hashPassword(
      password
    ) ===
    user.password_hash;

  if (
    !valid
  ) {
    return error(
      "بيانات الدخول غير صحيحة",
      "INVALID_CREDENTIALS",
      401
    );
  }

  const token =
    await createSession(
      env,
      user.id,
      request
    );

  const now =
    Date.now();

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

  if (
    token
  ) {
    const tokenHash =
      await hashPassword(
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

  if (
    !auth.ok
  ) {
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

          ) AS following_count,

          (
            SELECT COUNT(*)

            FROM snaps s

            WHERE
              s.user_id =
                u.id

              AND s.deleted_at
                IS NULL

          ) AS snaps_count

        FROM users u

        WHERE
          u.username = ?

          AND u.deleted_at
            IS NULL

        LIMIT 1
      `,
      [
        username,
      ]
    );

  if (
    !user
  ) {
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


async function updateProfile(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  if (
    !body
  ) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON"
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
    body.avatar_url !==
    undefined
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
      avatarUrl ||
        null,
      Date.now(),
      auth.user.user_id,
    ]
  );

  return success(
    {
      message:
        "تم تحديث الملف الشخصي",
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  if (
    auth.user.user_id ===
    targetUserId
  ) {
    return error(
      "لا يمكنك متابعة نفسك",
      "INVALID_ACTION"
    );
  }

  const target =
    await dbFirst(
      env,
      `
        SELECT id

        FROM users

        WHERE
          id = ?

          AND deleted_at
            IS NULL
      `,
      [
        targetUserId,
      ]
    );

  if (
    !target
  ) {
    return error(
      "المستخدم غير موجود",
      "USER_NOT_FOUND",
      404
    );
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

  return success(
    {
      following:
        true,
    }
  );
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

  if (
    !auth.ok
  ) {
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

  return success(
    {
      following:
        false,
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  if (
    !body
  ) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON"
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
      "يجب إضافة محتوى",
      "EMPTY_SNAP"
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
      "INVALID_VISIBILITY"
    );
  }

  const id =
    createId(
      "snap"
    );

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
      mediaUrl ||
        null,
      mediaType ||
        null,
      caption,
      visibility,
      now,
      now,
    ]
  );

  return success(
    {
      message:
        "تم نشر السنابة",

      snap:
        await getSnapById(
          env,
          id
        ),
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
        s.*,

        u.username,
        u.display_name,
        u.avatar_url,

        (
          SELECT COUNT(*)

          FROM likes l

          WHERE
            l.snap_id =
              s.id

        ) AS likes_count,

        (
          SELECT COUNT(*)

          FROM comments c

          WHERE
            c.snap_id =
              s.id

            AND c.deleted_at
              IS NULL

        ) AS comments_count

      FROM snaps s

      INNER JOIN users u
        ON u.id =
          s.user_id

      WHERE
        s.id = ?

        AND s.deleted_at
          IS NULL

      LIMIT 1
    `,
    [
      snapId,
    ]
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
    getPagination(
      request
    );

  let query = `
    SELECT
      s.*,

      u.username,
      u.display_name,
      u.avatar_url,

      (
        SELECT COUNT(*)

        FROM likes l

        WHERE
          l.snap_id =
            s.id

      ) AS likes_count,

      (
        SELECT COUNT(*)

        FROM comments c

        WHERE
          c.snap_id =
            s.id

          AND c.deleted_at
            IS NULL

      ) AS comments_count
  `;

  const params =
    [];

  if (
    authUser
  ) {
    query += `
      ,

      EXISTS (
        SELECT 1

        FROM likes ml

        WHERE
          ml.snap_id =
            s.id

          AND ml.user_id =
            ?
      ) AS liked
    `;

    params.push(
      authUser.user_id
    );
  }

  query += `
    FROM snaps s

    INNER JOIN users u
      ON u.id =
        s.user_id

    WHERE
      s.deleted_at
        IS NULL

      AND u.deleted_at
        IS NULL

      AND (
        s.visibility =
          'public'
  `;

  if (
    authUser
  ) {
    query += `
        OR s.user_id = ?

        OR (
          s.visibility =
            'followers'

          AND EXISTS (
            SELECT 1

            FROM followers f

            WHERE
              f.follower_id =
                ?

              AND f.following_id =
                s.user_id
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

    ORDER BY
      s.created_at DESC

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

  return success(
    {
      snaps,

      pagination: {
        page:
          Math.floor(
            offset /
              limit
          ) + 1,

        limit,

        offset,
      },
    }
  );
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

  if (
    !auth.ok
  ) {
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

        WHERE
          id = ?

          AND deleted_at
            IS NULL
      `,
      [
        snapId,
      ]
    );

  if (
    !snap
  ) {
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

  return success(
    {
      message:
        "تم حذف السنابة",
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  if (
    !body
  ) {
    return error(
      "بيانات غير صحيحة",
      "INVALID_JSON"
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
      "EMPTY_STORY"
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
      mediaUrl ||
        null,
      mediaType ||
        null,
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
          mediaUrl ||
          null,

        media_type:
          mediaType ||
          null,

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
  const stories =
    await dbAll(
      env,
      `
        SELECT
          st.*,

          u.username,
          u.display_name,
          u.avatar_url

        FROM stories st

        INNER JOIN users u
          ON u.id =
            st.user_id

        WHERE
          st.expires_at >
            ?

          AND u.deleted_at
            IS NULL

        ORDER BY
          st.created_at DESC
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

  if (
    !auth.ok
  ) {
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
      [
        storyId,
      ]
    );

  if (
    !story
  ) {
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
    [
      storyId,
    ]
  );

  return success(
    {
      message:
        "تم حذف القصة",
    }
  );
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

  if (
    !auth.ok
  ) {
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

        WHERE
          id = ?

          AND deleted_at
            IS NULL
      `,
      [
        snapId,
      ]
    );

  if (
    !snap
  ) {
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

  if (
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

  return success(
    {
      liked:
        true,
    }
  );
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

  if (
    !auth.ok
  ) {
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

  return success(
    {
      liked:
        false,
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  const content =
    cleanText(
      body?.content,
      1000
    );

  if (
    !content
  ) {
    return error(
      "التعليق فارغ",
      "EMPTY_COMMENT"
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

        WHERE
          id = ?

          AND deleted_at
            IS NULL
      `,
      [
        snapId,
      ]
    );

  if (
    !snap
  ) {
    return error(
      "السنابة غير موجودة",
      "SNAP_NOT_FOUND",
      404
    );
  }

  const id =
    createId(
      "comment"
    );

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

  return success(
    {
      comment:
        await dbFirst(
          env,
          `
            SELECT
              c.*,

              u.username,
              u.display_name,
              u.avatar_url

            FROM comments c

            INNER JOIN users u
              ON u.id =
                c.user_id

            WHERE
              c.id = ?
          `,
          [
            id,
          ]
        ),
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
    getPagination(
      request
    );

  const comments =
    await dbAll(
      env,
      `
        SELECT
          c.*,

          u.username,
          u.display_name,
          u.avatar_url

        FROM comments c

        INNER JOIN users u
          ON u.id =
            c.user_id

        WHERE
          c.snap_id = ?

          AND c.deleted_at
            IS NULL

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

  return success(
    {
      comments,
    }
  );
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
    q.length <
    2
  ) {
    return success(
      {
        users: [],
        snaps: [],
      }
    );
  }

  const term =
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
          deleted_at
            IS NULL

          AND (
            username LIKE ?

            OR display_name LIKE ?
          )

        ORDER BY
          username ASC

        LIMIT 20
      `,
      [
        term,
        term,
      ]
    );

  const snaps =
    await dbAll(
      env,
      `
        SELECT
          s.*,

          u.username,
          u.display_name,
          u.avatar_url

        FROM snaps s

        INNER JOIN users u
          ON u.id =
            s.user_id

        WHERE
          s.deleted_at
            IS NULL

          AND s.visibility =
            'public'

          AND s.caption LIKE ?

        ORDER BY
          s.created_at DESC

        LIMIT 20
      `,
      [
        term,
      ]
    );

  return success(
    {
      users,
      snaps,
    }
  );
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
    recipientId ===
    actorId
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const {
    limit,
    offset,
  } =
    getPagination(
      request
    );

  const notifications =
    await dbAll(
      env,
      `
        SELECT
          n.*,

          u.username AS actor_username,

          u.display_name AS actor_display_name,

          u.avatar_url AS actor_avatar_url

        FROM notifications n

        INNER JOIN users u
          ON u.id =
            n.actor_id

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

  return success(
    {
      notifications,
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  await dbRun(
    env,
    `
      UPDATE notifications

      SET
        is_read = 1

      WHERE
        recipient_id = ?
    `,
    [
      auth.user.user_id,
    ]
  );

  return success(
    {
      message:
        "تم تحديث الإشعارات",
    }
  );
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

  if (
    !auth.ok
  ) {
    return auth.response;
  }

  const body =
    await getJSON(
      request
    );

  const memberIds =
    Array.isArray(
      body?.member_ids
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
    uniqueMembers.length <
    2
  ) {
    return error(
      "يجب إضافة مستخدم آخر",
      "INVALID_MEMBERS"
    );
  }

  const placeholders =
    uniqueMembers
      .map(
        () =>
          "?"
      )
      .join(",");

  const users =
    await dbAll(
      env,
      `
        SELECT
          id

        FROM users

        WHERE
          id IN (
            ${placeholders}
          )

          AND deleted_at
            IS NULL
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
    uniqueMembers.length ===
    2
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

  if (
    !auth.ok
  ) {
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
            SELECT
              m.content

            FROM messages m

            WHERE
              m.conversation_id =
                c.id

              AND m.deleted_at
                IS NULL

            ORDER BY
              m.created_at DESC

            LIMIT 1

          ) AS last_message

        FROM conversations c

        INNER JOIN conversation_members cm

          ON cm.conversation_id =
            c.id

        WHERE
          cm.user_id = ?

        ORDER BY
          c.updated_at DESC
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
            ON u.id =
              cm.user_id

          WHERE
            cm.conversation_id =
              ?
        `,
        [
          conversation.id,
        ]
      );
  }

  return success(
    {
      conversations,
    }
  );
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

  if (
    !auth.ok
  ) {
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

  if (
    !member
  ) {
    return error(
      "لا تملك صلاحية الوصول",
      "FORBIDDEN",
      403
    );
  }

  const {
    limit,
    offset,
  } =
    getPagination(
      request
    );

  const messages =
    await dbAll(
      env,
      `
        SELECT
          m.*,

          u.username,
          u.display_name,
          u.avatar_url

        FROM messages m

        INNER JOIN users u
          ON u.id =
            m.sender_id

        WHERE
          m.conversation_id =
            ?

          AND m.deleted_at
            IS NULL

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

  return success(
    {
      messages:
        messages.reverse(),
    }
  );
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

  if (
    !auth.ok
  ) {
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

  if (
    !member
  ) {
    return error(
      "لا تملك صلاحية الوصول",
      "FORBIDDEN",
      403
    );
  }

  const body =
    await getJSON(
      request
    );

  const content =
    cleanText(
      body?.content,
      5000
    );

  if (
    !content
  ) {
    return error(
      "الرسالة فارغة",
      "EMPTY_MESSAGE"
    );
  }

  const id =
    createId(
      "message"
    );

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
        created_at
      )

      VALUES (?, ?, ?, ?, ?)
    `,
    [
      id,
      conversationId,
      auth.user.user_id,
      content,
      now,
    ]
  );

  await dbRun(
    env,
    `
      UPDATE conversations

      SET
        updated_at = ?

      WHERE
        id = ?
    `,
    [
      now,
      conversationId,
    ]
  );

  return success(
    {
      message:
        await dbFirst(
          env,
          `
            SELECT
              m.*,

              u.username,
              u.display_name,
              u.avatar_url

            FROM messages m

            INNER JOIN users u
              ON u.id =
                m.sender_id

            WHERE
              m.id = ?
          `,
          [
            id,
          ]
        ),
    },
    201
  );
}


// ============================================================
// WEBSOCKET
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

  if (
    !auth.ok
  ) {
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

  if (
    !member
  ) {
    return error(
      "لا تملك صلاحية الوصول",
      "FORBIDDEN",
      403
    );
  }

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

  const id =
    env.CHAT_ROOM.idFromName(
      conversationId
    );

  const stub =
    env.CHAT_ROOM.get(
      id
    );

  return stub.fetch(
    request
  );
}


// ============================================================
// HEALTH
// ============================================================

async function health(
  env
) {
  let database =
    false;

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
      true;

  } catch (
    err
  ) {
    database =
      false;
  }

  return success(
    {
      name:
        API_NAME,

      version:
        VERSION,

      status:
        "online",

      database:
        database
          ? "connected"
          : "error",

      services: {
        d1:
          database,

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
    return health(
      env
    );
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

    if (
      !auth.ok
    ) {
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

  const commentMatch =
    path.match(
      /^\/api\/snaps\/([^/]+)\/comments$/
    );


  if (
    commentMatch &&
    method ===
      "POST"
  ) {
    return createComment(
      request,
      env,
      commentMatch[1]
    );
  }


  if (
    commentMatch &&
    method ===
      "GET"
  ) {
    return getComments(
      request,
      env,
      commentMatch[1]
    );
  }


  // ==========================================================
  // STORIES
  // ==========================================================

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
    method === "POST" &&
    path ===
      "/api/conversations"
  ) {
    return createConversation(
      request,
      env
    );
  }


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


  const conversationMessagesMatch =
    path.match(
      /^\/api\/conversations\/([^/]+)\/messages$/
    );


  if (
    conversationMessagesMatch &&
    method ===
      "GET"
  ) {
    return getConversationMessages(
      request,
      env,
      conversationMessagesMatch[1]
    );
  }


  if (
    conversationMessagesMatch &&
    method ===
      "POST"
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
      /^\/api\/chat\/([^/]+)$/
    );


  if (
    websocketMatch &&
    method ===
      "GET"
  ) {
    return handleWebSocket(
      request,
      env,
      websocketMatch[1]
    );
  }


  // ==========================================================
  // 404
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
// WORKER EXPORT
// ============================================================

export default {

  async fetch(
    request,
    env,
    ctx
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
        err.message ||
          "Internal Server Error",
        "INTERNAL_ERROR",
        500
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

    this.sessions =
      new Set();
  }


  async fetch(
    request
  ) {
    const upgrade =
      request.headers.get(
        "Upgrade"
      );

    if (
      upgrade !==
      "websocket"
    ) {
      return new Response(
        "Expected WebSocket",
        {
          status: 426,
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

        let payload;

        try {

          const data =
            JSON.parse(
              event.data
            );

          payload =
            JSON.stringify(
              {
                success:
                  true,

                type:
                  "message",

                data,

                timestamp:
                  Date.now(),
              }
            );

        } catch {

          payload =
            JSON.stringify(
              {
                success:
                  false,

                error:
                  "INVALID_MESSAGE",
              }
            );

        }

        for (
          const session
          of this.sessions
        ) {

          if (
            session.readyState ===
            WebSocket.OPEN
          ) {

            try {
              session.send(
                payload
              );
            } catch {}
          }
        }
      }
    );


    const remove =
      () => {
        this.sessions.delete(
          server
        );
      };


    server.addEventListener(
      "close",
      remove
    );

    server.addEventListener(
      "error",
      remove
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
}
