import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import multer from "multer";
import pg from "pg";
import { createClient } from "redis";
import { z } from "zod";
import {
  createFinikPayment,
  extractPaymentIdFromWebhook,
  getDefaultPlanId,
  getFrontendBaseUrl,
  getPlanAmount,
  getPlanTitle,
  isFinikConfigured,
  DEFAULT_PLAN_ID,
  PLAN_TO_SUBSCRIPTION,
  verifyFinikWebhook
} from "./finik.js";
import { computeFinalAmount, formatPromoRow, normalizePromoCode } from "./promo.js";
import {
  buildAuthenticatedManifest,
  getHlsDir,
  hlsRoot,
  isHlsReady,
  packageVideoToHls,
  safeSegmentName
} from "./hlsTranscode.js";
import { createReadStream, mkdirSync } from "node:fs";
import { access, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const { Pool } = pg;
const app = express();

// Nginx проксирует запросы и передаёт X-Forwarded-For — нужно для rate-limit и req.ip
if (process.env.TRUST_PROXY !== "false") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "replace-in-production";
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "replace-in-production-2";
const maxDevices = Number(process.env.MAX_DEVICES_PER_USER || 2);
const hlsKeySecret = process.env.HLS_KEY_SECRET || "replace-hls-secret";
const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "admin1234";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((item) => item.trim());

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
/** Без автопереподключения: иначе при выключенном Redis сыпятся пустые error-события в консоль. */
const redis = process.env.REDIS_URL
  ? createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: () => false
      }
    })
  : null;
let dbReady = false;

const memState = {
  refreshTokens: new Map(),
  sessions: new Map(),
  paymentsById: new Map(),
  progressByUser: new Map([
    [1, { lastVideoId: 102, watchedSeconds: { 101: 860, 102: 530 }, videoCompleted: { 101: true, 102: false } }]
  ]),
  /** @type {Array<{ id: number; title: string; slug: string | null; body: string; published: boolean; createdAt: string; updatedAt: string }>} */
  news: [],
  /** @type {Array<{ id: number; userId: number; senderRole: "admin" | "student"; text: string; createdAt: string }>} */
  supportMessages: [],
  /** @type {Map<string, string>} key: `${userId}:${role}` => ISO timestamp */
  supportLastRead: new Map(),
  /** @type {Array<{ id: number; code: string; discountType: string; discountValue: number; maxUses: number | null; usesCount: number; expiresAt: string | null; active: boolean; createdAt: string; updatedAt: string }>} */
  promoCodes: [],
  /** @type {Array<{ promoCodeId: number; userId: number; paymentId: string | null; redeemedAt: string }>} */
  promoRedemptions: [],
  /** @type {Record<string, string>} */
  settings: {},
  /** @type {Array<{ id: number; userId: number; alertType: string; message: string; meta: object; dismissed: boolean; createdAt: string }>} */
  securityAlerts: []
};

let memNewsNextId = 1;
let memSupportMessageNextId = 1;
let memPromoNextId = 1;
let memSecurityAlertNextId = 1;

let memNextUserId = 10_000;
const memRegisteredUsersByEmail = new Map();
const memRegisteredUsersById = new Map();

const demoUser = {
  id: 1,
  email: "student@example.com",
  passwordHash: bcrypt.hashSync("demo1234", 10),
  nickname: "Student",
  subscriptionType: "premium",
  examDate: "2026-11-14"
};

const adminUser = {
  id: 999,
  email: adminEmail,
  passwordHash: bcrypt.hashSync(adminPassword, 10),
  nickname: "Admin",
  subscriptionType: "admin"
};

const chapters = [
  {
    id: 1,
    title: "Биохимия",
    order: 1,
    subtopics: [
      {
        id: 11,
        title: "Молекулы",
        order: 1,
        videos: [
          { id: 101, title: "Белки и аминокислоты", duration: 860, order: 1, isTrial: true },
          { id: 102, title: "Углеводы и липиды", duration: 920, order: 2, isTrial: true },
          { id: 103, title: "Ферменты и катализ", duration: 540, order: 3, isTrial: false }
        ]
      }
    ]
  },
  {
    id: 2,
    title: "Иммунология",
    order: 2,
    subtopics: [
      {
        id: 21,
        title: "Клеточный иммунитет",
        order: 1,
        videos: [{ id: 201, title: "Т-лимфоциты", duration: 780, order: 1, isTrial: true }]
      }
    ]
  }
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
mkdirSync(uploadsDir, { recursive: true });
mkdirSync(hlsRoot, { recursive: true });

const hlsPackaging = new Map();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().min(1).max(80).optional()
});

const adminUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().min(1).max(80).optional(),
  subscriptionType: z.enum(["free", "basic", "premium", "mentor"]).optional().default("free")
});

const adminUserUpdateSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    nickname: z.string().min(1).max(80).optional(),
    subscriptionType: z.enum(["free", "basic", "premium", "mentor"]).optional(),
    banned: z.boolean().optional(),
    banReason: z.string().max(500).optional().nullable()
  })
  .refine(
    (data) =>
      data.email !== undefined ||
      data.password !== undefined ||
      data.nickname !== undefined ||
      data.subscriptionType !== undefined ||
      data.banned !== undefined ||
      data.banReason !== undefined,
    { message: "No fields to update" }
  );

const securityAlertsDismissSchema = z
  .object({
    ids: z.array(z.coerce.number().int()).optional(),
    userId: z.coerce.number().int().optional()
  })
  .refine((data) => (data.ids && data.ids.length > 0) || data.userId !== undefined, {
    message: "ids or userId required"
  });

const activateSubscriptionSchema = z.object({
  plan: z.literal("standard").optional().default("standard")
});

const createPaymentSchema = z.object({
  plan: z.literal("standard").optional().default("standard"),
  promoCode: z.string().max(64).optional()
});

const validatePromoSchema = z.object({
  promoCode: z.string().min(1).max(64)
});

const promoCreateSchema = z.object({
  code: z.string().min(3).max(32),
  discountType: z.enum(["full", "percent", "fixed"]),
  discountValue: z.coerce.number().min(0).optional().default(0),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional().default(true)
});

const promoUpdateSchema = z.object({
  active: z.boolean().optional(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().nullable().optional()
});

const billingSettingsSchema = z.object({
  amount: z.coerce.number().min(0).max(1_000_000)
});

const SUBSCRIPTION_AMOUNT_KEY = "subscription_amount";

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const progressSchema = z.object({
  watchedSeconds: z.number().int().min(0),
  completed: z.boolean().optional().default(false)
});

const courseSchema = z.object({ title: z.string().min(1) });
const courseUpdateSchema = z.object({ title: z.string().min(1) });
const subtopicSchema = z.object({
  courseId: z.coerce.number().int(),
  title: z.string().min(1)
});
const subtopicUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    courseId: z.coerce.number().int().optional()
  })
  .refine((data) => data.title !== undefined || data.courseId !== undefined, {
    message: "No fields to update"
  });
const videoSchema = z.object({
  subtopicId: z.coerce.number().int(),
  title: z.string().min(1),
  duration: z.coerce.number().int().min(0).optional().default(0),
  streamPath: z.string().optional().default("")
});
const videoUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    duration: z.coerce.number().int().min(0).optional(),
    subtopicId: z.coerce.number().int().optional()
  })
  .refine((data) => data.title !== undefined || data.duration !== undefined || data.subtopicId !== undefined, {
    message: "No fields to update"
  });
const reorderSchema = z.object({
  courses: z.array(z.coerce.number().int()).optional(),
  subtopics: z
    .array(
      z.object({
        courseId: z.coerce.number().int(),
        ids: z.array(z.coerce.number().int())
      })
    )
    .optional(),
  videos: z
    .array(
      z.object({
        subtopicId: z.coerce.number().int(),
        ids: z.array(z.coerce.number().int())
      })
    )
    .optional()
});

const newsCreateSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().max(200).optional().nullable(),
  body: z.string().max(100_000).optional().default(""),
  published: z.boolean().optional().default(false)
});

const newsUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z.string().max(200).nullable().optional(),
  body: z.string().max(100_000).optional(),
  published: z.boolean().optional()
});

const supportMessageCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  videoId: z.coerce.number().int().positive().optional()
});

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function getDeviceId(req) {
  return req.headers["x-device-id"] || "unknown-device";
}

function getIp(req) {
  return req.ip || req.socket.remoteAddress || null;
}

function getOrigin(req) {
  return req.headers.origin || "";
}

function setStreamCors(req, res) {
  const origin = getOrigin(req);
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return;
  }
  const referer = String(req.headers.referer || "");
  if (!referer) return;
  try {
    const refOrigin = new URL(referer).origin;
    if (allowedOrigins.includes(refOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", refOrigin);
      res.setHeader("Vary", "Origin");
    }
  } catch {
    /* ignore bad referer */
  }
}

function getDeviceFromRequest(req) {
  return String(req.headers["x-device-id"] || req.query.did || "unknown-device");
}

/** Clear TS samples (CORS *); demo manifest points here after token check. */
const demoHlsRemoteBase =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/v1";

/**
 * Validates JWT for HLS manifest/segment (?token= & optional did=).
 * @returns {object|null} payload or null if response already sent
 */
function verifyVideoAccessForHls(req, res, videoId) {
  const accessToken = String(req.query.token || "");
  if (!accessToken) {
    res.status(401).json({ message: "Missing video token" });
    return null;
  }

  let accessPayload;
  try {
    accessPayload = jwt.verify(accessToken, jwtSecret);
    if (accessPayload.type !== "video-access" || Number(accessPayload.videoId) !== videoId) {
      res.status(401).json({ message: "Invalid access token" });
      return null;
    }
  } catch {
    res.status(401).json({ message: "Invalid access token" });
    return null;
  }

  const reqDevice = getDeviceFromRequest(req);
  if (accessPayload.deviceId && accessPayload.deviceId !== reqDevice) {
    res.status(401).json({ message: "Invalid device" });
    return null;
  }
  // User-Agent у <video> с другого домена может отличаться от fetch — не проверяем uah.
  const reqOrigin = getOrigin(req);
  // <video src="api..."> не отправляет Origin — не блокировать, если заголовка нет
  if (accessPayload.origin && reqOrigin && accessPayload.origin !== reqOrigin) {
    res.status(401).json({ message: "Invalid origin" });
    return null;
  }

  return accessPayload;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.subscriptionType === "admin" ? "admin" : "student",
      subscription: user.subscriptionType
    },
    jwtSecret,
    { expiresIn: "15m" }
  );
}

function signRefreshToken(user, deviceId) {
  return jwt.sign({ userId: user.id, type: "refresh", deviceId }, jwtRefreshSecret, {
    expiresIn: "7d"
  });
}

async function putSession(userId, deviceId, ip, userAgent) {
  if (pool) {
    await pool.query(
      `insert into sessions (user_id, device_id, ip, user_agent, last_active)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, device_id) do update
       set ip = excluded.ip, user_agent = excluded.user_agent, last_active = now()`,
      [userId, deviceId, ip, userAgent]
    );

    const result = await pool.query(
      `select id from sessions
       where user_id = $1
       order by last_active desc`,
      [userId]
    );

    if (result.rows.length > maxDevices) {
      const staleIds = result.rows.slice(maxDevices).map((row) => row.id);
      await pool.query(`delete from sessions where id = any($1::bigint[])`, [staleIds]);
    }
    return;
  }

  const key = String(userId);
  const list = memState.sessions.get(key) || [];
  const filtered = list.filter((item) => item.deviceId !== deviceId);
  filtered.unshift({ deviceId, ip, userAgent, lastActive: Date.now() });
  memState.sessions.set(key, filtered.slice(0, maxDevices));
}

async function isUserBanned(userId) {
  const id = Number(userId);
  if (id === adminUser.id) return false;
  if (!dbReady) {
    const memUser = getMemRegisteredUserById(id);
    if (memUser) return Boolean(memUser.banned);
    if (id === demoUser.id) return Boolean(demoUser.banned);
    return false;
  }
  const result = await pool.query(`select banned from users where id = $1 limit 1`, [id]);
  return Boolean(result.rows[0]?.banned);
}

async function revokeAllUserSessions(userId) {
  if (dbReady) {
    await pool.query(`delete from refresh_tokens where user_id = $1`, [userId]);
    await pool.query(`delete from sessions where user_id = $1`, [userId]);
    return;
  }
  memState.sessions.delete(String(userId));
  for (const key of [...memState.refreshTokens.keys()]) {
    if (key.startsWith(`${userId}:`)) memState.refreshTokens.delete(key);
  }
}

function mapSessionRow(row) {
  return {
    deviceId: row.deviceId ?? row.device_id,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? row.user_agent ?? null,
    lastActive: row.lastActive ?? row.last_active ?? null
  };
}

async function fetchAdminUserDevices({ multiOnly = false } = {}) {
  if (!dbReady) {
    const grouped = [];
    for (const u of [demoUser, ...memRegisteredUsersById.values()]) {
      if (u.subscriptionType === "admin") continue;
      const sessions = memState.sessions.get(String(u.id)) || [];
      if (sessions.length === 0) continue;
      if (multiOnly && sessions.length < 2) continue;
      grouped.push({
        userId: u.id,
        email: u.email,
        nickname: u.nickname,
        banned: Boolean(u.banned),
        deviceCount: sessions.length,
        multiDevice: sessions.length > 1,
        devices: sessions.map((s) =>
          mapSessionRow({
            deviceId: s.deviceId,
            ip: s.ip,
            userAgent: s.userAgent,
            lastActive: new Date(s.lastActive).toISOString()
          })
        )
      });
    }
    grouped.sort((a, b) => b.deviceCount - a.deviceCount || Number(a.userId) - Number(b.userId));
    return grouped;
  }

  const r = await pool.query(
    `select u.id as "userId", u.email, u.nickname, u.banned,
            s.device_id as "deviceId", host(s.ip) as ip, s.user_agent as "userAgent",
            s.last_active as "lastActive"
     from users u
     join sessions s on s.user_id = u.id
     where u.subscription_type != 'admin'
     order by u.id, s.last_active desc`
  );

  const byUser = new Map();
  for (const row of r.rows) {
    const key = String(row.userId);
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: row.userId,
        email: row.email,
        nickname: row.nickname,
        banned: Boolean(row.banned),
        deviceCount: 0,
        multiDevice: false,
        devices: []
      });
    }
    const entry = byUser.get(key);
    entry.devices.push(mapSessionRow(row));
    entry.deviceCount = entry.devices.length;
    entry.multiDevice = entry.deviceCount > 1;
  }

  let grouped = [...byUser.values()];
  if (multiOnly) grouped = grouped.filter((item) => item.multiDevice);
  grouped.sort((a, b) => b.deviceCount - a.deviceCount || Number(a.userId) - Number(b.userId));
  return grouped;
}

async function recordMultiDeviceAlert(userId, deviceId, ip, userAgent) {
  if (Number(userId) === adminUser.id) return;

  let isNewDevice = false;
  let otherDeviceCount = 0;

  if (dbReady) {
    const existing = await pool.query(`select device_id from sessions where user_id = $1`, [userId]);
    isNewDevice = !existing.rows.some((row) => row.device_id === deviceId);
    otherDeviceCount = existing.rows.filter((row) => row.device_id !== deviceId).length;
  } else {
    const list = memState.sessions.get(String(userId)) || [];
    isNewDevice = !list.some((item) => item.deviceId === deviceId);
    otherDeviceCount = list.filter((item) => item.deviceId !== deviceId).length;
  }

  if (!isNewDevice || otherDeviceCount < 1) return;

  const user = await getUserPublicById(userId);
  const label = user?.nickname || user?.email || `ID ${userId}`;
  const message = `Ученик «${label}» вошёл с нового устройства при активных сессиях на ${otherDeviceCount} других устройствах`;
  const meta = { deviceId, ip: ip || null, userAgent: userAgent || null, otherDeviceCount };

  if (dbReady) {
    await pool.query(
      `insert into security_alerts (user_id, alert_type, message, meta)
       values ($1, 'multi_device_login', $2, $3::jsonb)`,
      [userId, message, JSON.stringify(meta)]
    );
    return;
  }

  memState.securityAlerts.unshift({
    id: memSecurityAlertNextId++,
    userId: Number(userId),
    alertType: "multi_device_login",
    message,
    meta,
    dismissed: false,
    createdAt: new Date().toISOString()
  });
}

async function storeRefreshToken(userId, deviceId, token) {
  if (dbReady) {
    const tokenHash = await bcrypt.hash(token, 10);
    await pool.query(
      `insert into refresh_tokens (user_id, device_id, token_hash, expires_at)
       values ($1, $2, $3, now() + interval '7 days')
       on conflict (user_id, device_id) do update
       set token_hash = excluded.token_hash, expires_at = excluded.expires_at`,
      [userId, deviceId, tokenHash]
    );
    return;
  }

  if (redis?.isReady) {
    await redis.setEx(`refresh:${userId}:${deviceId}`, 60 * 60 * 24 * 7, token);
    return;
  }
  memState.refreshTokens.set(`${userId}:${deviceId}`, token);
}

async function getRefreshToken(userId, deviceId) {
  if (dbReady) {
    const result = await pool.query(
      `select token_hash, expires_at from refresh_tokens
       where user_id = $1 and device_id = $2`,
      [userId, deviceId]
    );
    return result.rows[0] || null;
  }

  if (redis?.isReady) {
    return redis.get(`refresh:${userId}:${deviceId}`);
  }
  return memState.refreshTokens.get(`${userId}:${deviceId}`) || null;
}

async function deleteRefreshToken(userId, deviceId) {
  if (dbReady) {
    await pool.query(`delete from refresh_tokens where user_id = $1 and device_id = $2`, [
      userId,
      deviceId
    ]);
    return;
  }

  if (redis?.isReady) {
    await redis.del(`refresh:${userId}:${deviceId}`);
    return;
  }
  memState.refreshTokens.delete(`${userId}:${deviceId}`);
}

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    req.user = jwt.verify(token, jwtSecret);
    if (req.user.role !== "admin" && (await isUserBanned(req.user.userId))) {
      return res.status(403).json({ message: "Аккаунт заблокирован" });
    }
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  return next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname || "").slice(0, 10) || ".bin";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }
});

async function seedDemoData() {
  if (!dbReady) return;

  await pool.query(
    `insert into users (id, email, password_hash, nickname, subscription_type, exam_date)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (email) do nothing`,
    [
      demoUser.id,
      demoUser.email,
      demoUser.passwordHash,
      demoUser.nickname,
      demoUser.subscriptionType,
      demoUser.examDate
    ]
  );

  await pool.query(
    `insert into users (id, email, password_hash, nickname, subscription_type)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         nickname = excluded.nickname,
         subscription_type = excluded.subscription_type`,
    [adminUser.id, adminUser.email, adminUser.passwordHash, adminUser.nickname, "admin"]
  );

  await pool.query(
    `insert into courses (id, title, "order")
     values (1, 'Биохимия', 1), (2, 'Иммунология', 2)
     on conflict (id) do nothing`
  );

  await pool.query(
    `insert into subtopics (id, course_id, title, "order")
     values
       (11, 1, 'Молекулы', 1),
       (21, 2, 'Клеточный иммунитет', 1)
     on conflict (id) do nothing`
  );

  await pool.query(
    `insert into videos (id, subtopic_id, title, duration, stream_path, "order", is_trial)
     values
       (101, 11, 'Белки и аминокислоты', 860, 'hls/101/manifest.m3u8', 1, true),
       (102, 11, 'Углеводы и липиды', 920, 'hls/102/manifest.m3u8', 2, true),
       (103, 11, 'Ферменты и катализ', 540, 'hls/103/manifest.m3u8', 3, false),
       (201, 21, 'Т-лимфоциты', 780, 'hls/201/manifest.m3u8', 1, true)
     on conflict (id) do update
     set is_trial = excluded.is_trial`
  );

  await pool.query(
    `select setval(pg_get_serial_sequence('users','id'), coalesce((select max(id) from users), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('courses','id'), coalesce((select max(id) from courses), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('subtopics','id'), coalesce((select max(id) from subtopics), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('videos','id'), coalesce((select max(id) from videos), 1), true)`
  );
}

async function ensureNewsTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists news (
      id bigserial primary key,
      title text not null,
      slug text,
      body text not null default '',
      published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create unique index if not exists news_slug_unique on news (slug)
    where slug is not null and length(btrim(slug)) > 0
  `);
}

async function ensurePaymentsTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists payments (
      id bigserial primary key,
      payment_id uuid not null unique,
      user_id bigint not null references users(id) on delete cascade,
      plan text not null,
      amount numeric(12, 2) not null,
      status text not null default 'pending',
      finik_transaction_id text,
      finik_receipt_number text,
      promo_code text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table payments add column if not exists promo_code text`);
  await pool.query(`create index if not exists idx_payments_user on payments(user_id)`);
  await pool.query(`create index if not exists idx_payments_status on payments(status)`);
  await pool.query(
    `create index if not exists idx_payments_finik_tx on payments(finik_transaction_id)`
  );
}

async function ensurePromoCodesTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists promo_codes (
      id bigserial primary key,
      code text not null unique,
      discount_type text not null check (discount_type in ('full', 'percent', 'fixed')),
      discount_value numeric(12, 2) not null default 0,
      max_uses int,
      uses_count int not null default 0,
      expires_at timestamptz,
      created_by bigint references users(id) on delete set null,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists promo_redemptions (
      id bigserial primary key,
      promo_code_id bigint not null references promo_codes(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      payment_id uuid references payments(payment_id) on delete set null,
      redeemed_at timestamptz not null default now(),
      unique (promo_code_id, user_id)
    )
  `);
  await pool.query(`create index if not exists idx_promo_codes_active on promo_codes(active)`);
}

async function ensureAppSettingsTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function getDefaultSubscriptionAmount() {
  return getPlanAmount(getDefaultPlanId()) ?? 1;
}

async function getSubscriptionAmount() {
  if (dbReady) {
    const r = await pool.query(`select value from app_settings where key = $1 limit 1`, [
      SUBSCRIPTION_AMOUNT_KEY
    ]);
    if (r.rows[0]) {
      const amount = Number(r.rows[0].value);
      if (Number.isFinite(amount) && amount >= 0) return amount;
    }
    return getDefaultSubscriptionAmount();
  }
  if (memState.settings[SUBSCRIPTION_AMOUNT_KEY] != null) {
    const amount = Number(memState.settings[SUBSCRIPTION_AMOUNT_KEY]);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return getDefaultSubscriptionAmount();
}

async function setSubscriptionAmount(amount) {
  const value = String(amount);
  if (dbReady) {
    await pool.query(
      `insert into app_settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [SUBSCRIPTION_AMOUNT_KEY, value]
    );
    return amount;
  }
  memState.settings[SUBSCRIPTION_AMOUNT_KEY] = value;
  return amount;
}

async function getBillingPlanPayload() {
  const id = getDefaultPlanId();
  const amount = await getSubscriptionAmount();
  return {
    id,
    title: getPlanTitle(id),
    amount,
    periodDays: 30,
    periodLabel: "1 месяц"
  };
}

async function ensureSupportMessagesTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists support_messages (
      id bigserial primary key,
      user_id bigint not null references users(id) on delete cascade,
      video_id bigint references videos(id) on delete set null,
      sender_role text not null check (sender_role in ('admin', 'student')),
      text text not null,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table support_messages add column if not exists video_id bigint`);
  await pool.query(`
    do $$ begin
      alter table support_messages
      add constraint support_messages_video_id_fkey
      foreign key (video_id) references videos(id) on delete set null;
    exception when duplicate_object then null;
    end $$;
  `);
  await pool.query(`
    create index if not exists idx_support_messages_user_created
    on support_messages (user_id, created_at asc)
  `);
  await pool.query(`
    create index if not exists idx_support_messages_user_video_created
    on support_messages (user_id, video_id, created_at asc)
  `);
}

function getVideoTitleById(videoId) {
  const vid = Number(videoId);
  if (!Number.isFinite(vid)) return null;
  for (const course of chapters) {
    for (const subtopic of course.subtopics || []) {
      const video = (subtopic.videos || []).find((v) => Number(v.id) === vid);
      if (video) return video.title || null;
    }
  }
  return null;
}

async function ensureSupportReadsTable() {
  if (!pool) return;
  await pool.query(`
    create table if not exists support_reads (
      user_id bigint not null references users(id) on delete cascade,
      reader_role text not null check (reader_role in ('admin', 'student')),
      last_read_at timestamptz not null default now(),
      primary key (user_id, reader_role)
    )
  `);
}

async function getSupportLastRead(userId, role) {
  if (!dbReady) {
    return memState.supportLastRead.get(`${userId}:${role}`) || null;
  }
  const result = await pool.query(
    `select last_read_at as "lastReadAt" from support_reads where user_id = $1 and reader_role = $2 limit 1`,
    [userId, role]
  );
  return result.rows[0]?.lastReadAt || null;
}

async function setSupportLastRead(userId, role) {
  if (!dbReady) {
    memState.supportLastRead.set(`${userId}:${role}`, new Date().toISOString());
    return;
  }
  await pool.query(
    `insert into support_reads (user_id, reader_role, last_read_at)
     values ($1, $2, now())
     on conflict (user_id, reader_role) do update
     set last_read_at = excluded.last_read_at`,
    [userId, role]
  );
}

function normalizeNewsSlug(slug) {
  const s = String(slug ?? "").trim();
  return s.length ? s : null;
}

function memNewsSlugTaken(slug, exceptId) {
  if (!slug) return false;
  return memState.news.some((n) => n.slug === slug && n.id !== exceptId);
}

function getMemRegisteredUserById(userId) {
  return memRegisteredUsersById.get(Number(userId)) || null;
}

function getAuthUserForRefresh(userId) {
  const id = Number(userId);
  if (id === adminUser.id) return adminUser;
  if (id === demoUser.id) return demoUser;
  return getMemRegisteredUserById(id);
}

async function getUserByEmail(email) {
  const key = normalizeEmail(email);
  if (key === normalizeEmail(adminUser.email)) return adminUser;
  if (!dbReady) {
    const registered = memRegisteredUsersByEmail.get(key);
    if (registered) return registered;
    if (key === normalizeEmail(demoUser.email)) return demoUser;
    return null;
  }

  const result = await pool.query(
    `select id, email, password_hash, nickname, subscription_type, exam_date, banned, subscription_expires_at
     from users where lower(trim(email)) = $1 limit 1`,
    [key]
  );
  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    nickname: row.nickname,
    subscriptionType: row.subscription_type,
    examDate: row.exam_date,
    banned: Boolean(row.banned),
    subscriptionExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at).toISOString() : null
  };
}

const TRIAL_VIDEO_IDS_MEM = new Set([101, 102, 201]);

function hasFullAccess(user) {
  if (!user) return false;
  if (user.subscriptionType === "admin") return true;
  const paidTypes = ["premium", "mentor", "basic"];
  if (!paidTypes.includes(user.subscriptionType)) return false;
  if (!user.subscriptionExpiresAt) return true;
  return new Date(user.subscriptionExpiresAt) > new Date();
}

function buildProfilePayload(user) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    subscriptionType: user.subscriptionType,
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    hasFullAccess: hasFullAccess(user)
  };
}

async function getUserRecordById(userId) {
  const id = Number(userId);
  if (id === adminUser.id) return adminUser;
  if (id === demoUser.id) return demoUser;
  if (!dbReady) return getMemRegisteredUserById(id);
  const result = await pool.query(
    `select id, email, password_hash, nickname, subscription_type, exam_date, banned, subscription_expires_at
     from users where id = $1 limit 1`,
    [id]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    nickname: row.nickname,
    subscriptionType: row.subscription_type,
    examDate: row.exam_date,
    banned: Boolean(row.banned),
    subscriptionExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at).toISOString() : null
  };
}

async function isVideoTrial(videoId) {
  const vid = Number(videoId);
  if (!Number.isFinite(vid)) return false;
  if (!dbReady) return TRIAL_VIDEO_IDS_MEM.has(vid);
  const result = await pool.query(`select is_trial from videos where id = $1 limit 1`, [vid]);
  return Boolean(result.rows[0]?.is_trial);
}

async function canUserWatchVideo(userId, videoId) {
  const user = await getUserRecordById(userId);
  if (!user) return false;
  if (hasFullAccess(user)) return true;
  return isVideoTrial(videoId);
}

async function getUserPublicById(userId) {
  const id = Number(userId);
  if (id === adminUser.id) {
    return { id: adminUser.id, email: adminUser.email, nickname: adminUser.nickname };
  }
  if (id === demoUser.id) {
    return { id: demoUser.id, email: demoUser.email, nickname: demoUser.nickname };
  }
  const memUser = getMemRegisteredUserById(id);
  if (memUser) {
    return { id: memUser.id, email: memUser.email, nickname: memUser.nickname };
  }
  if (!dbReady) return null;
  const result = await pool.query(`select id, email, nickname from users where id = $1 limit 1`, [id]);
  if (!result.rows[0]) return null;
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    nickname: result.rows[0].nickname
  };
}

async function fetchChapters() {
  if (!dbReady) return chapters;

  const result = await pool.query(
    `select
       c.id as course_id, c.title as course_title, c."order" as course_order,
       s.id as subtopic_id, s.title as subtopic_title, s."order" as subtopic_order,
       v.id as video_id, v.title as video_title, v.duration, v.stream_path, v."order" as video_order,
       v.is_trial as video_is_trial
     from courses c
     left join subtopics s on s.course_id = c.id
     left join videos v on v.subtopic_id = s.id
     order by c."order", s."order", v."order"`
  );

  const courseMap = new Map();
  for (const row of result.rows) {
    if (!courseMap.has(row.course_id)) {
      courseMap.set(row.course_id, {
        id: row.course_id,
        title: row.course_title,
        order: row.course_order,
        subtopics: []
      });
    }

    const course = courseMap.get(row.course_id);
    if (!row.subtopic_id) continue;

    let subtopic = course.subtopics.find((item) => item.id === row.subtopic_id);
    if (!subtopic) {
      subtopic = {
        id: row.subtopic_id,
        title: row.subtopic_title,
        order: row.subtopic_order,
        videos: []
      };
      course.subtopics.push(subtopic);
    }

    if (row.video_id) {
      subtopic.videos.push({
        id: row.video_id,
        title: row.video_title,
        duration: row.duration,
        streamPath: row.stream_path,
        order: row.video_order,
        isTrial: Boolean(row.video_is_trial)
      });
    }
  }

  return Array.from(courseMap.values());
}

async function fetchChaptersForUser(userId) {
  const tree = await fetchChapters();
  const user = await getUserRecordById(userId);
  const fullAccess = hasFullAccess(user);
  return tree.map((course) => ({
    ...course,
    subtopics: (course.subtopics || []).map((subtopic) => ({
      ...subtopic,
      videos: (subtopic.videos || []).map((video) => ({
        ...video,
        isTrial: Boolean(video.isTrial),
        locked: !fullAccess && !video.isTrial
      }))
    }))
  }));
}

function countVideosInChapterTree(tree) {
  return tree.reduce(
    (acc, course) => acc + course.subtopics.reduce((n, st) => n + st.videos.length, 0),
    0
  );
}

async function fetchProgress(userId) {
  if (!dbReady) {
    const base = memState.progressByUser.get(userId) || {
      lastVideoId: null,
      watchedSeconds: {},
      videoCompleted: {}
    };
    if (!base.videoCompleted) base.videoCompleted = {};
    const totalVideos = countVideosInChapterTree(chapters);
    let completedCount = 0;
    for (const v of Object.values(base.videoCompleted)) {
      if (v) completedCount += 1;
    }
    return { ...base, completedCount, totalVideos };
  }

  const [summaryResult, watchedResult, totalResult] = await Promise.all([
    pool.query(`select last_video_id from users where id = $1`, [userId]),
    pool.query(`select video_id, watched_seconds, completed from progress where user_id = $1`, [userId]),
    pool.query(`select count(*)::int as total from videos`)
  ]);

  const watchedSeconds = {};
  const videoCompleted = {};
  let completedCount = 0;
  for (const row of watchedResult.rows) {
    watchedSeconds[row.video_id] = row.watched_seconds;
    if (row.completed) {
      videoCompleted[row.video_id] = true;
      completedCount += 1;
    }
  }

  const totalVideos = totalResult.rows[0]?.total || 0;
  return {
    lastVideoId: summaryResult.rows[0]?.last_video_id ?? null,
    watchedSeconds,
    videoCompleted,
    completedCount,
    totalVideos
  };
}

async function saveProgress(userId, videoId, watchedSeconds, completed) {
  if (!dbReady) {
    const userState = memState.progressByUser.get(userId) || {
      watchedSeconds: {},
      videoCompleted: {}
    };
    if (!userState.videoCompleted) userState.videoCompleted = {};
    userState.lastVideoId = videoId;
    userState.watchedSeconds[videoId] = watchedSeconds;
    userState.videoCompleted[videoId] = Boolean(completed);
    memState.progressByUser.set(userId, userState);
    return;
  }

  await pool.query(
    `insert into progress (user_id, video_id, watched_seconds, completed, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, video_id) do update
     set watched_seconds = excluded.watched_seconds,
         completed = excluded.completed,
         updated_at = now()`,
    [userId, videoId, watchedSeconds, completed]
  );
  await pool.query(`update users set last_video_id = $2 where id = $1`, [userId, videoId]);
}

async function sendAuthTokensForUser(req, res, user) {
  if (user.banned) {
    return res.status(403).json({ message: "Аккаунт заблокирован. Обратитесь в поддержку." });
  }

  const deviceId = String(getDeviceId(req));
  const ip = getIp(req);
  const userAgent = req.headers["user-agent"] || "";
  await recordMultiDeviceAlert(user.id, deviceId, ip, userAgent);
  await putSession(user.id, deviceId, ip, userAgent);
  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user, deviceId);
  await storeRefreshToken(user.id, deviceId, refreshToken);
  return res.json({
    token,
    refreshToken,
    profile: buildProfilePayload(user)
  });
}

app.get("/health", async (_req, res) => {
  const redisOk = redis?.isReady || false;
  let dbOk = false;

  if (pool) {
    try {
      await pool.query("select 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  res.json({ ok: true, dbOk, redisOk });
});

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const { email, password } = parsed.data;

  const user = await getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (dbReady && user.id === adminUser.id) {
    await pool.query(
      `insert into users (id, email, password_hash, nickname, subscription_type)
       values ($1, $2, $3, $4, $5)
       on conflict (email) do update
       set password_hash = excluded.password_hash,
           nickname = excluded.nickname,
           subscription_type = excluded.subscription_type`,
      [adminUser.id, adminUser.email, adminUser.passwordHash, adminUser.nickname, "admin"]
    );
  }

  return sendAuthTokensForUser(req, res, user);
});

app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  const email = normalizeEmail(parsed.data.email);
  const nickname = (parsed.data.nickname?.trim() || email.split("@")[0] || "user").slice(0, 80);

  if (email === normalizeEmail(adminUser.email) || email === normalizeEmail(demoUser.email)) {
    return res.status(409).json({ message: "Этот email зарезервирован" });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: "Пользователь с таким email уже есть" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  if (dbReady) {
    try {
      const created = await pool.query(
        `insert into users (email, password_hash, nickname, subscription_type)
         values ($1, $2, $3, 'free')
         returning id, email, nickname, subscription_type`,
        [email, passwordHash, nickname]
      );
      const row = created.rows[0];
      const user = {
        id: row.id,
        email: row.email,
        passwordHash,
        nickname: row.nickname,
        subscriptionType: row.subscription_type
      };
      return sendAuthTokensForUser(req, res, user);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Пользователь с таким email уже есть" });
      }
      return res.status(500).json({ message: "Регистрация не удалась", error: error.message });
    }
  }

  const id = memNextUserId++;
  const user = { id, email, passwordHash, nickname, subscriptionType: "free" };
  memRegisteredUsersByEmail.set(email, user);
  memRegisteredUsersById.set(id, user);
  memState.progressByUser.set(id, { lastVideoId: null, watchedSeconds: {}, videoCompleted: {} });
  return sendAuthTokensForUser(req, res, user);
});

async function activateSubscriptionForUser(userId, plan) {
  const nextSubscription = PLAN_TO_SUBSCRIPTION[plan];
  if (!nextSubscription) {
    throw new Error("Unknown plan");
  }

  if (dbReady) {
    const updated = await pool.query(
      `update users
       set subscription_type = $2,
           subscription_expires_at = case
             when subscription_expires_at is not null and subscription_expires_at > now()
             then subscription_expires_at + interval '30 days'
             else now() + interval '30 days'
           end
       where id = $1
       returning id, email, nickname, subscription_type, subscription_expires_at`,
      [userId, nextSubscription]
    );
    if (!updated.rows[0]) {
      return null;
    }
    const row = updated.rows[0];
    return buildProfilePayload({
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      subscriptionType: row.subscription_type,
      subscriptionExpiresAt: row.subscription_expires_at
        ? new Date(row.subscription_expires_at).toISOString()
        : null
    });
  }

  const user = getMemRegisteredUserById(userId);
  if (user) {
    user.subscriptionType = nextSubscription;
    const base = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : Date.now();
    const from = Math.max(Date.now(), base);
    user.subscriptionExpiresAt = new Date(from + 30 * 24 * 60 * 60 * 1000).toISOString();
    memRegisteredUsersById.set(user.id, user);
    memRegisteredUsersByEmail.set(normalizeEmail(user.email), user);
    return buildProfilePayload(user);
  }

  if (userId === demoUser.id) {
    demoUser.subscriptionType = nextSubscription;
    const base = demoUser.subscriptionExpiresAt ? new Date(demoUser.subscriptionExpiresAt).getTime() : Date.now();
    const from = Math.max(Date.now(), base);
    demoUser.subscriptionExpiresAt = new Date(from + 30 * 24 * 60 * 60 * 1000).toISOString();
    return buildProfilePayload(demoUser);
  }

  return null;
}

async function findPromoByCode(code) {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  if (dbReady) {
    const r = await pool.query(`select * from promo_codes where code = $1 limit 1`, [normalized]);
    return r.rows[0] || null;
  }
  const found = memState.promoCodes.find((p) => p.code === normalized);
  if (!found) return null;
  return {
    id: found.id,
    code: found.code,
    discount_type: found.discountType,
    discount_value: found.discountValue,
    max_uses: found.maxUses,
    uses_count: found.usesCount,
    expires_at: found.expiresAt,
    active: found.active
  };
}

async function hasUserRedeemedPromo(promoId, userId) {
  if (dbReady) {
    const r = await pool.query(
      `select 1 from promo_redemptions where promo_code_id = $1 and user_id = $2 limit 1`,
      [promoId, userId]
    );
    return Boolean(r.rows[0]);
  }
  return memState.promoRedemptions.some((r) => r.promoCodeId === promoId && Number(r.userId) === Number(userId));
}

async function validatePromoForUser(code, userId, baseAmount) {
  const promo = await findPromoByCode(code);
  if (!promo) return { ok: false, message: "Промокод не найден" };
  if (!promo.active) return { ok: false, message: "Промокод деактивирован" };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { ok: false, message: "Промокод истёк" };
  }
  if (promo.max_uses != null && Number(promo.uses_count) >= Number(promo.max_uses)) {
    return { ok: false, message: "Промокод исчерпан" };
  }
  if (await hasUserRedeemedPromo(promo.id, userId)) {
    return { ok: false, message: "Вы уже использовали этот промокод" };
  }
  const finalAmount = computeFinalAmount(baseAmount, promo);
  const discount = Math.max(0, Math.round((Number(baseAmount) - finalAmount) * 100) / 100);
  return {
    ok: true,
    promo,
    code: promo.code,
    finalAmount,
    discount,
    free: finalAmount <= 0
  };
}

async function redeemPromoCode(promoId, userId, paymentId) {
  if (dbReady) {
    await pool.query(`update promo_codes set uses_count = uses_count + 1, updated_at = now() where id = $1`, [
      promoId
    ]);
    await pool.query(
      `insert into promo_redemptions (promo_code_id, user_id, payment_id) values ($1, $2, $3)
       on conflict (promo_code_id, user_id) do nothing`,
      [promoId, userId, paymentId]
    );
    return;
  }
  const promo = memState.promoCodes.find((p) => p.id === promoId);
  if (promo) promo.usesCount += 1;
  if (!memState.promoRedemptions.some((r) => r.promoCodeId === promoId && Number(r.userId) === Number(userId))) {
    memState.promoRedemptions.push({
      promoCodeId: promoId,
      userId,
      paymentId,
      redeemedAt: new Date().toISOString()
    });
  }
}

async function completeFreeSubscriptionPayment({ paymentId, userId, plan, promo, promoCodeLabel }) {
  if (dbReady) {
    await pool.query(
      `insert into payments (payment_id, user_id, plan, amount, status, promo_code)
       values ($1, $2, $3, 0, 'succeeded', $4)`,
      [paymentId, userId, plan, promoCodeLabel || null]
    );
    if (promo) await redeemPromoCode(promo.id, userId, paymentId);
  } else {
    memState.paymentsById.set(paymentId, {
      paymentId,
      userId,
      plan,
      amount: 0,
      status: "succeeded",
      promoCode: promoCodeLabel || null
    });
    if (promo) await redeemPromoCode(promo.id, userId, paymentId);
  }
  return activateSubscriptionForUser(userId, plan);
}

async function applyPromoAfterPaymentSuccess(paymentId, userId, promoCodeLabel) {
  if (!promoCodeLabel) return;
  const promo = await findPromoByCode(promoCodeLabel);
  if (!promo) return;
  if (await hasUserRedeemedPromo(promo.id, userId)) return;
  await redeemPromoCode(promo.id, userId, paymentId);
}

app.get("/billing/plan", async (_req, res) => {
  try {
    res.json(await getBillingPlanPayload());
  } catch (error) {
    res.status(500).json({ message: "Failed to load plan", error: error.message });
  }
});

app.post("/billing/validate-promo", auth, async (req, res) => {
  const parsed = validatePromoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (req.user?.role === "admin") {
    return res.status(403).json({ message: "Admin subscription cannot be changed" });
  }

  const baseAmount = await getSubscriptionAmount();
  const result = await validatePromoForUser(parsed.data.promoCode, req.user.userId, baseAmount);
  if (!result.ok) {
    return res.status(400).json({ message: result.message });
  }
  return res.json({
    code: result.code,
    baseAmount,
    finalAmount: result.finalAmount,
    discount: result.discount,
    free: result.free
  });
});

app.post("/billing/create-payment", auth, async (req, res) => {
  const parsed = createPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  if (req.user?.role === "admin") {
    return res.status(403).json({ message: "Admin subscription cannot be changed" });
  }

  const plan = parsed.data.plan || getDefaultPlanId();
  const baseAmount = await getSubscriptionAmount();
  if (baseAmount == null || baseAmount < 0) {
    return res.status(400).json({ message: "Invalid plan amount" });
  }

  let finalAmount = baseAmount;
  let promo = null;
  let promoCodeLabel = null;
  if (parsed.data.promoCode?.trim()) {
    const promoResult = await validatePromoForUser(parsed.data.promoCode, req.user.userId, baseAmount);
    if (!promoResult.ok) {
      return res.status(400).json({ message: promoResult.message });
    }
    finalAmount = promoResult.finalAmount;
    promo = promoResult.promo;
    promoCodeLabel = promoResult.code;
  }

  const paymentId = crypto.randomUUID();

  if (finalAmount <= 0) {
    try {
      const profile = await completeFreeSubscriptionPayment({
        paymentId,
        userId: req.user.userId,
        plan,
        promo,
        promoCodeLabel
      });
      if (!profile) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        paymentId,
        free: true,
        amount: 0,
        plan,
        planTitle: getPlanTitle(plan),
        promoCode: promoCodeLabel,
        profile
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to activate subscription", error: error.message });
    }
  }

  if (!isFinikConfigured()) {
    return res.status(503).json({ message: "Finik payment is not configured on the server" });
  }

  const redirectUrl = `${getFrontendBaseUrl().replace(/\/$/, "")}/payment/success?paymentId=${paymentId}`;

  try {
    if (dbReady) {
      await pool.query(
        `insert into payments (payment_id, user_id, plan, amount, status, promo_code)
         values ($1, $2, $3, $4, 'pending', $5)`,
        [paymentId, req.user.userId, plan, finalAmount, promoCodeLabel]
      );
    } else {
      memState.paymentsById.set(paymentId, {
        paymentId,
        userId: req.user.userId,
        plan,
        amount: finalAmount,
        status: "pending",
        promoCode: promoCodeLabel
      });
    }

    const finik = await createFinikPayment({
      paymentId,
      amount: finalAmount,
      plan,
      redirectUrl
    });

    return res.json({
      paymentId,
      paymentUrl: finik.paymentUrl,
      amount: finalAmount,
      baseAmount,
      discount: Math.max(0, Math.round((baseAmount - finalAmount) * 100) / 100),
      plan,
      planTitle: getPlanTitle(plan),
      promoCode: promoCodeLabel
    });
  } catch (error) {
    if (dbReady) {
      await pool.query(`delete from payments where payment_id = $1 and status = 'pending'`, [paymentId]);
    } else {
      memState.paymentsById.delete(paymentId);
    }
    return res.status(502).json({ message: "Failed to create Finik payment", error: error.message });
  }
});

app.get("/billing/payment-status/:paymentId", auth, async (req, res) => {
  const paymentId = String(req.params.paymentId || "");
  if (!paymentId) {
    return res.status(400).json({ message: "Missing paymentId" });
  }

  try {
    if (dbReady) {
      const result = await pool.query(
        `select payment_id, user_id, plan, amount, status
         from payments
         where payment_id = $1`,
        [paymentId]
      );
      const row = result.rows[0];
      if (!row) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (Number(row.user_id) !== Number(req.user.userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      let profile = null;
      if (row.status === "succeeded") {
        const userResult = await pool.query(
          `select id, email, nickname, subscription_type, subscription_expires_at
           from users where id = $1`,
          [row.user_id]
        );
        const userRow = userResult.rows[0];
        if (userRow) {
          profile = buildProfilePayload({
            id: userRow.id,
            email: userRow.email,
            nickname: userRow.nickname,
            subscriptionType: userRow.subscription_type,
            subscriptionExpiresAt: userRow.subscription_expires_at
              ? new Date(userRow.subscription_expires_at).toISOString()
              : null
          });
        }
      }

      return res.json({
        paymentId: row.payment_id,
        plan: row.plan,
        amount: Number(row.amount),
        status: row.status,
        profile
      });
    }

    const payment = memState.paymentsById.get(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    if (Number(payment.userId) !== Number(req.user.userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    let profile = null;
    if (payment.status === "succeeded") {
      const user = await getUserRecordById(payment.userId);
      if (user) {
        profile = buildProfilePayload(user);
      }
    }

    return res.json({
      paymentId: payment.paymentId,
      plan: payment.plan,
      amount: payment.amount,
      status: payment.status,
      profile
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load payment status", error: error.message });
  }
});

app.post("/billing/webhook/finik", async (req, res) => {
  const verification = await verifyFinikWebhook(req, req.body);
  if (!verification.ok) {
    return res.status(401).json({ message: verification.reason || "Invalid webhook signature" });
  }

  const paymentId = extractPaymentIdFromWebhook(req.body);
  const finikStatus = String(req.body?.status || "").toUpperCase();
  const transactionId = req.body?.transactionId || req.body?.id || null;
  const receiptNumber = req.body?.receiptNumber || null;

  if (!paymentId) {
    return res.status(400).json({ message: "Missing paymentId in webhook payload" });
  }

  const nextStatus =
    finikStatus === "SUCCEEDED" ? "succeeded" : finikStatus === "FAILED" ? "failed" : "pending";

  try {
    if (dbReady) {
      const existing = await pool.query(
        `select payment_id, user_id, plan, status, promo_code
         from payments
         where payment_id = $1`,
        [paymentId]
      );
      const row = existing.rows[0];
      if (!row) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (row.status === "succeeded") {
        return res.json({ ok: true, duplicate: true });
      }

      await pool.query(
        `update payments
         set status = $2,
             finik_transaction_id = coalesce($3, finik_transaction_id),
             finik_receipt_number = coalesce($4, finik_receipt_number),
             updated_at = now()
         where payment_id = $1`,
        [paymentId, nextStatus, transactionId, receiptNumber]
      );

      if (nextStatus === "succeeded") {
        await activateSubscriptionForUser(row.user_id, row.plan);
        await applyPromoAfterPaymentSuccess(paymentId, row.user_id, row.promo_code);
      }

      return res.json({ ok: true });
    }

    const payment = memState.paymentsById.get(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    if (payment.status === "succeeded") {
      return res.json({ ok: true, duplicate: true });
    }

    payment.status = nextStatus;
    payment.finikTransactionId = transactionId;
    memState.paymentsById.set(paymentId, payment);

    if (nextStatus === "succeeded") {
      await activateSubscriptionForUser(payment.userId, payment.plan);
      await applyPromoAfterPaymentSuccess(paymentId, payment.userId, payment.promoCode);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Webhook processing failed", error: error.message });
  }
});

app.post("/billing/activate-subscription", auth, async (req, res) => {
  if (process.env.BILLING_STUB !== "true") {
    return res.status(410).json({ message: "Use Finik payment flow instead of manual activation" });
  }

  const parsed = activateSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  if (req.user?.role === "admin") {
    return res.status(403).json({ message: "Admin subscription cannot be changed" });
  }

  try {
    const profile = await activateSubscriptionForUser(req.user.userId, parsed.data.plan);
    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ profile });
  } catch (error) {
    return res.status(500).json({ message: "Failed to activate subscription", error: error.message });
  }
});

// Admin API (MVP)
app.get("/admin/catalog", auth, requireAdmin, async (_req, res) => {
  try {
    const items = await fetchChapters();
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Failed to load catalog", error: error.message });
  }
});

app.post("/admin/courses", auth, requireAdmin, async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  const maxRes = await pool.query(`select coalesce(max("order"), 0) as max_order from courses`);
  const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
  const created = await pool.query(
    `insert into courses (title, "order") values ($1, $2) returning id, title, "order"`,
    [parsed.data.title, nextOrder]
  );
  res.status(201).json(created.rows[0]);
});

app.patch("/admin/courses/:courseId", auth, requireAdmin, async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!Number.isFinite(courseId)) return res.status(400).json({ message: "Invalid id" });
  const parsed = courseUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const updated = await pool.query(
      `update courses set title = $2 where id = $1 returning id, title, "order"`,
      [courseId, parsed.data.title]
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Course not found" });
    return res.json(updated.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update course", error: error.message });
  }
});

app.post("/admin/subtopics", auth, requireAdmin, async (req, res) => {
  const parsed = subtopicSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  const maxRes = await pool.query(
    `select coalesce(max("order"), 0) as max_order from subtopics where course_id = $1`,
    [parsed.data.courseId]
  );
  const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
  const created = await pool.query(
    `insert into subtopics (course_id, title, "order") values ($1, $2, $3)
     returning id, course_id, title, "order"`,
    [parsed.data.courseId, parsed.data.title, nextOrder]
  );
  res.status(201).json(created.rows[0]);
});

app.patch("/admin/subtopics/:subtopicId", auth, requireAdmin, async (req, res) => {
  const subtopicId = Number(req.params.subtopicId);
  if (!Number.isFinite(subtopicId)) return res.status(400).json({ message: "Invalid id" });
  const parsed = subtopicUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const fields = [];
    const values = [];
    let p = 1;
    if (parsed.data.title !== undefined) {
      fields.push(`title = $${p++}`);
      values.push(parsed.data.title);
    }
    if (parsed.data.courseId !== undefined) {
      fields.push(`course_id = $${p++}`);
      values.push(parsed.data.courseId);
    }
    values.push(subtopicId);
    const updated = await pool.query(
      `update subtopics set ${fields.join(", ")} where id = $${p}
       returning id, course_id, title, "order"`,
      values
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Subtopic not found" });
    return res.json(updated.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update subtopic", error: error.message });
  }
});

app.post("/admin/videos", auth, requireAdmin, async (req, res) => {
  const parsed = videoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  const maxRes = await pool.query(
    `select coalesce(max("order"), 0) as max_order from videos where subtopic_id = $1`,
    [parsed.data.subtopicId]
  );
  const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
  const created = await pool.query(
    `insert into videos (subtopic_id, title, duration, stream_path, "order")
     values ($1, $2, $3, $4, $5)
     returning id, subtopic_id, title, duration, stream_path, "order"`,
    [parsed.data.subtopicId, parsed.data.title, parsed.data.duration, parsed.data.streamPath, nextOrder]
  );
  res.status(201).json(created.rows[0]);
});

app.patch("/admin/videos/:videoId", auth, requireAdmin, async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return res.status(400).json({ message: "Invalid id" });
  const parsed = videoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const fields = [];
    const values = [];
    let p = 1;
    if (parsed.data.title !== undefined) {
      fields.push(`title = $${p++}`);
      values.push(parsed.data.title);
    }
    if (parsed.data.duration !== undefined) {
      fields.push(`duration = $${p++}`);
      values.push(parsed.data.duration);
    }
    if (parsed.data.subtopicId !== undefined) {
      fields.push(`subtopic_id = $${p++}`);
      values.push(parsed.data.subtopicId);
    }
    values.push(videoId);
    const updated = await pool.query(
      `update videos set ${fields.join(", ")} where id = $${p}
       returning id, subtopic_id, title, duration, stream_path, "order"`,
      values
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Video not found" });
    return res.json({
      id: updated.rows[0].id,
      subtopicId: updated.rows[0].subtopic_id,
      title: updated.rows[0].title,
      duration: updated.rows[0].duration,
      streamPath: updated.rows[0].stream_path,
      order: updated.rows[0].order
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update video", error: error.message });
  }
});

app.post("/admin/reorder", auth, requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  await pool.query("begin");
  try {
    if (parsed.data.courses?.length) {
      for (let i = 0; i < parsed.data.courses.length; i += 1) {
        await pool.query(`update courses set "order" = $2 where id = $1`, [parsed.data.courses[i], i + 1]);
      }
    }
    if (parsed.data.subtopics?.length) {
      for (const group of parsed.data.subtopics) {
        for (let i = 0; i < group.ids.length; i += 1) {
          await pool.query(
            `update subtopics set "order" = $3, course_id = $2 where id = $1`,
            [group.ids[i], group.courseId, i + 1]
          );
        }
      }
    }
    if (parsed.data.videos?.length) {
      for (const group of parsed.data.videos) {
        for (let i = 0; i < group.ids.length; i += 1) {
          await pool.query(
            `update videos set "order" = $3, subtopic_id = $2 where id = $1`,
            [group.ids[i], group.subtopicId, i + 1]
          );
        }
      }
    }
    await pool.query("commit");
    res.status(204).send();
  } catch (error) {
    await pool.query("rollback");
    res.status(500).json({ message: "Reorder failed", error: error.message });
  }
});

app.post("/admin/videos/:videoId/upload", auth, requireAdmin, upload.single("file"), async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });
  if (!req.file) return res.status(400).json({ message: "Missing file" });

  const streamPath = `upload:${req.file.filename}`;
  const updated = await pool.query(
    `update videos set stream_path = $2 where id = $1
     returning id, subtopic_id, title, duration, stream_path, "order"`,
    [videoId, streamPath]
  );
  if (!updated.rows[0]) return res.status(404).json({ message: "Video not found" });

  const inputPath = path.join(uploadsDir, req.file.filename);
  void queueHlsPackaging(videoId, inputPath, req.file.filename);

  res.json({
    ...updated.rows[0],
    hlsProcessing: true
  });
});

app.get("/admin/videos/:videoId/hls-status", auth, requireAdmin, async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });
  const row = await pool.query(`select stream_path from videos where id = $1`, [videoId]);
  if (!row.rows[0]) return res.status(404).json({ message: "Video not found" });
  const streamPath = row.rows[0].stream_path || "";
  res.json({
    streamPath,
    ready: isProtectedHlsStreamPath(streamPath) && (await isHlsReady(videoId)),
    processing: hlsPackaging.has(videoId) || streamPath.startsWith("upload:")
  });
});

app.post("/admin/videos/:videoId/package-hls", auth, requireAdmin, async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });
  const row = await pool.query(`select stream_path from videos where id = $1`, [videoId]);
  if (!row.rows[0]) return res.status(404).json({ message: "Video not found" });
  const streamPath = row.rows[0].stream_path || "";
  const inputPath = await resolveSourceMp4ForVideo(videoId, streamPath);
  if (!inputPath) {
    return res.status(400).json({ message: "No source MP4 for this lesson" });
  }
  try {
    await access(inputPath);
  } catch {
    return res.status(404).json({ message: "Source file missing on server" });
  }
  const sourceFilename = path.basename(inputPath);
  await queueHlsPackaging(videoId, inputPath, sourceFilename);
  res.json({ ok: true, message: "HLS packaging started" });
});

async function removeVideoMediaFiles(videoId, streamPath) {
  hlsPackaging.delete(videoId);

  let sourceMp4 = getUploadFilenameFromStreamPath(streamPath);
  if (!sourceMp4 && isProtectedHlsStreamPath(streamPath)) {
    try {
      sourceMp4 = (await readFile(path.join(getHlsDir(videoId), "source.txt"), "utf8")).trim();
    } catch {
      /* no source metadata */
    }
  }

  try {
    await rm(getHlsDir(videoId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (sourceMp4) {
    try {
      await unlink(path.join(uploadsDir, sourceMp4));
    } catch {
      /* ignore */
    }
  }
}

app.delete("/admin/videos/:videoId", auth, requireAdmin, async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return res.status(400).json({ message: "Invalid id" });
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const row = await pool.query(`select stream_path from videos where id = $1`, [videoId]);
    if (!row.rows[0]) return res.status(404).json({ message: "Video not found" });
    const streamPath = row.rows[0].stream_path || "";
    await pool.query(`delete from videos where id = $1`, [videoId]);
    void removeVideoMediaFiles(videoId, streamPath);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete video", error: error.message });
  }
});

app.delete("/admin/subtopics/:subtopicId", auth, requireAdmin, async (req, res) => {
  const subtopicId = Number(req.params.subtopicId);
  if (!Number.isFinite(subtopicId)) return res.status(400).json({ message: "Invalid id" });
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const videos = await pool.query(`select id, stream_path from videos where subtopic_id = $1`, [subtopicId]);
    const exists = await pool.query(`select id from subtopics where id = $1`, [subtopicId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "Subtopic not found" });
    await pool.query(`delete from subtopics where id = $1`, [subtopicId]);
    for (const v of videos.rows) {
      void removeVideoMediaFiles(v.id, v.stream_path || "");
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete subtopic", error: error.message });
  }
});

app.delete("/admin/courses/:courseId", auth, requireAdmin, async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!Number.isFinite(courseId)) return res.status(400).json({ message: "Invalid id" });
  if (!dbReady) return res.status(503).json({ message: "DB required for admin" });

  try {
    const videos = await pool.query(
      `select v.id, v.stream_path
       from videos v
       join subtopics s on s.id = v.subtopic_id
       where s.course_id = $1`,
      [courseId]
    );
    const exists = await pool.query(`select id from courses where id = $1`, [courseId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "Course not found" });
    await pool.query(`delete from courses where id = $1`, [courseId]);
    for (const v of videos.rows) {
      void removeVideoMediaFiles(v.id, v.stream_path || "");
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete course", error: error.message });
  }
});

app.post("/admin/users", auth, requireAdmin, async (req, res) => {
  const parsed = adminUserCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  const email = normalizeEmail(parsed.data.email);
  const nickname = (parsed.data.nickname?.trim() || email.split("@")[0] || "user").slice(0, 80);
  const subscriptionType = parsed.data.subscriptionType;

  if (email === normalizeEmail(adminUser.email) || email === normalizeEmail(demoUser.email)) {
    return res.status(409).json({ message: "Этот email зарезервирован" });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: "Пользователь с таким email уже есть" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    if (dbReady) {
      const created = await pool.query(
        `insert into users (email, password_hash, nickname, subscription_type)
         values ($1, $2, $3, $4)
         returning id, email, nickname, subscription_type as "subscriptionType",
                   exam_date as "examDate", created_at as "createdAt"`,
        [email, passwordHash, nickname, subscriptionType]
      );
      return res.status(201).json(created.rows[0]);
    }

    const id = memNextUserId++;
    const user = { id, email, passwordHash, nickname, subscriptionType };
    memRegisteredUsersByEmail.set(email, user);
    memRegisteredUsersById.set(id, user);
    memState.progressByUser.set(id, { lastVideoId: null, watchedSeconds: {}, videoCompleted: {} });
    return res.status(201).json({
      id,
      email,
      nickname,
      subscriptionType,
      examDate: null,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Пользователь с таким email уже есть" });
    }
    return res.status(500).json({ message: "Не удалось создать пользователя", error: error.message });
  }
});

app.get("/admin/users", auth, requireAdmin, async (_req, res) => {
  try {
    if (!dbReady) {
      const mapUserRow = (u, subscriptionType) => {
        const sessions = memState.sessions.get(String(u.id)) || [];
        const deviceCount = sessions.length;
        const hasSecurityAlert = memState.securityAlerts.some(
          (a) => !a.dismissed && Number(a.userId) === Number(u.id)
        );
        return {
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          subscriptionType: subscriptionType ?? u.subscriptionType,
          examDate: u.examDate ?? null,
          createdAt: u.createdAt ?? null,
          banned: Boolean(u.banned),
          bannedAt: u.bannedAt ?? null,
          banReason: u.banReason ?? null,
          deviceCount,
          multiDevice: deviceCount > 1,
          hasSecurityAlert
        };
      };
      const rows = [mapUserRow(demoUser), mapUserRow(adminUser, "admin")];
      for (const u of memRegisteredUsersById.values()) {
        if (rows.some((r) => r.id === u.id)) continue;
        rows.push(mapUserRow(u));
      }
      rows.sort((a, b) => a.id - b.id);
      return res.json(rows);
    }

    const r = await pool.query(
      `select u.id, u.email, u.nickname, u.subscription_type as "subscriptionType",
              u.exam_date as "examDate", u.created_at as "createdAt",
              u.banned, u.banned_at as "bannedAt", u.ban_reason as "banReason",
              coalesce(s.device_count, 0)::int as "deviceCount",
              (coalesce(s.device_count, 0) > 1) as "multiDevice",
              exists (
                select 1 from security_alerts sa
                where sa.user_id = u.id and sa.dismissed = false
              ) as "hasSecurityAlert"
       from users u
       left join (
         select user_id, count(*)::int as device_count
         from sessions
         group by user_id
       ) s on s.user_id = u.id
       order by u.id`
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to list users", error: error.message });
  }
});

app.patch("/admin/users/:userId", auth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ message: "Invalid id" });

  const parsed = adminUserUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  if (userId === adminUser.id) {
    return res.status(403).json({ message: "Нельзя изменять учётную запись администратора" });
  }

  const data = parsed.data;

  if (data.email) {
    const email = normalizeEmail(data.email);
    if (email === normalizeEmail(adminUser.email)) {
      return res.status(409).json({ message: "Этот email зарезервирован" });
    }
    const existing = await getUserByEmail(email);
    if (existing && Number(existing.id) !== Number(userId)) {
      return res.status(409).json({ message: "Пользователь с таким email уже есть" });
    }
  }

  try {
    if (!dbReady) {
      const memUser =
        userId === demoUser.id ? demoUser : getMemRegisteredUserById(userId);
      if (!memUser) return res.status(404).json({ message: "User not found" });

      if (data.email) memUser.email = normalizeEmail(data.email);
      if (data.nickname) memUser.nickname = data.nickname.trim().slice(0, 80);
      if (data.subscriptionType) memUser.subscriptionType = data.subscriptionType;
      if (data.password) memUser.passwordHash = await bcrypt.hash(data.password, 10);
      if (data.banned === true) {
        memUser.banned = true;
        memUser.bannedAt = new Date().toISOString();
        memUser.banReason = data.banReason?.trim() || null;
        await revokeAllUserSessions(userId);
      } else if (data.banned === false) {
        memUser.banned = false;
        memUser.bannedAt = null;
        memUser.banReason = null;
      } else if (data.banReason !== undefined) {
        memUser.banReason = data.banReason?.trim() || null;
      }

      const list = memState.sessions.get(String(userId)) || [];
      return res.json({
        id: memUser.id,
        email: memUser.email,
        nickname: memUser.nickname,
        subscriptionType: memUser.subscriptionType,
        examDate: memUser.examDate ?? null,
        createdAt: memUser.createdAt ?? null,
        banned: Boolean(memUser.banned),
        bannedAt: memUser.bannedAt ?? null,
        banReason: memUser.banReason ?? null,
        deviceCount: list.length
      });
    }

    const exists = await pool.query(`select id, subscription_type from users where id = $1`, [userId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "User not found" });
    if (exists.rows[0].subscription_type === "admin") {
      return res.status(403).json({ message: "Нельзя изменять учётную запись администратора" });
    }

    const sets = [];
    const values = [];
    let idx = 1;

    if (data.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(normalizeEmail(data.email));
    }
    if (data.nickname !== undefined) {
      sets.push(`nickname = $${idx++}`);
      values.push(data.nickname.trim().slice(0, 80));
    }
    if (data.subscriptionType !== undefined) {
      sets.push(`subscription_type = $${idx++}`);
      values.push(data.subscriptionType);
    }
    if (data.password !== undefined) {
      sets.push(`password_hash = $${idx++}`);
      values.push(await bcrypt.hash(data.password, 10));
    }
    if (data.banned === true) {
      sets.push(`banned = true`);
      sets.push(`banned_at = now()`);
      if (data.banReason !== undefined) {
        sets.push(`ban_reason = $${idx++}`);
        values.push(data.banReason?.trim() || null);
      }
    } else if (data.banned === false) {
      sets.push(`banned = false`);
      sets.push(`banned_at = null`);
      sets.push(`ban_reason = null`);
    } else if (data.banReason !== undefined) {
      sets.push(`ban_reason = $${idx++}`);
      values.push(data.banReason?.trim() || null);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(userId);
    const updated = await pool.query(
      `update users set ${sets.join(", ")}
       where id = $${idx}
       returning id, email, nickname, subscription_type as "subscriptionType",
                 exam_date as "examDate", created_at as "createdAt",
                 banned, banned_at as "bannedAt", ban_reason as "banReason"`,
      values
    );

    if (data.banned === true) {
      await revokeAllUserSessions(userId);
    }

    const deviceCount = await pool.query(`select count(*)::int as c from sessions where user_id = $1`, [
      userId
    ]);

    return res.json({
      ...updated.rows[0],
      deviceCount: deviceCount.rows[0]?.c ?? 0
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Пользователь с таким email уже есть" });
    }
    return res.status(500).json({ message: "Не удалось обновить пользователя", error: error.message });
  }
});

app.get("/admin/user-devices", auth, requireAdmin, async (req, res) => {
  const multiOnly = req.query.multiOnly === "1" || req.query.multiOnly === "true";
  try {
    const rows = await fetchAdminUserDevices({ multiOnly });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to load user devices", error: error.message });
  }
});

app.get("/admin/security-alerts", auth, requireAdmin, async (_req, res) => {
  try {
    if (!dbReady) {
      const alerts = memState.securityAlerts
        .filter((a) => !a.dismissed)
        .map((a) => {
          const user = a.userId === demoUser.id ? demoUser : getMemRegisteredUserById(a.userId);
          return {
            id: a.id,
            userId: a.userId,
            alertType: a.alertType,
            message: a.message,
            meta: a.meta,
            createdAt: a.createdAt,
            userEmail: user?.email ?? null,
            userNickname: user?.nickname ?? null
          };
        });
      return res.json(alerts);
    }

    const r = await pool.query(
      `select a.id, a.user_id as "userId", a.alert_type as "alertType", a.message,
              a.meta, a.created_at as "createdAt",
              u.email as "userEmail", u.nickname as "userNickname"
       from security_alerts a
       join users u on u.id = a.user_id
       where a.dismissed = false
       order by a.created_at desc
       limit 100`
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to load security alerts", error: error.message });
  }
});

app.post("/admin/security-alerts/dismiss-viewed", auth, requireAdmin, async (req, res) => {
  const parsed = securityAlertsDismissSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  const { ids, userId } = parsed.data;

  try {
    if (!dbReady) {
      for (const alert of memState.securityAlerts) {
        if (alert.dismissed) continue;
        if (ids?.length) {
          if (ids.some((id) => Number(id) === Number(alert.id))) alert.dismissed = true;
        } else if (Number(alert.userId) === Number(userId)) {
          alert.dismissed = true;
        }
      }
      return res.status(204).send();
    }

    if (ids?.length) {
      await pool.query(
        `update security_alerts set dismissed = true
         where id = any($1::bigint[]) and dismissed = false`,
        [ids.map(Number)]
      );
    } else {
      await pool.query(
        `update security_alerts set dismissed = true where user_id = $1 and dismissed = false`,
        [userId]
      );
    }
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to dismiss alerts", error: error.message });
  }
});

app.post("/admin/security-alerts/:alertId/dismiss", auth, requireAdmin, async (req, res) => {
  const alertId = Number(req.params.alertId);
  if (!Number.isFinite(alertId)) return res.status(400).json({ message: "Invalid id" });

  try {
    if (!dbReady) {
      const alert = memState.securityAlerts.find((a) => a.id === alertId);
      if (!alert) return res.status(404).json({ message: "Alert not found" });
      alert.dismissed = true;
      return res.status(204).send();
    }

    const r = await pool.query(
      `update security_alerts set dismissed = true where id = $1 and dismissed = false returning id`,
      [alertId]
    );
    if (!r.rows[0]) return res.status(404).json({ message: "Alert not found" });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to dismiss alert", error: error.message });
  }
});

app.get("/admin/billing/settings", auth, requireAdmin, async (_req, res) => {
  try {
    const payload = await getBillingPlanPayload();
    let updatedAt = null;
    if (dbReady) {
      const r = await pool.query(`select updated_at from app_settings where key = $1 limit 1`, [
        SUBSCRIPTION_AMOUNT_KEY
      ]);
      updatedAt = r.rows[0]?.updated_at ?? null;
    }
    res.json({ ...payload, updatedAt });
  } catch (error) {
    res.status(500).json({ message: "Failed to load billing settings", error: error.message });
  }
});

app.patch("/admin/billing/settings", auth, requireAdmin, async (req, res) => {
  const parsed = billingSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  try {
    await setSubscriptionAmount(parsed.data.amount);
    const payload = await getBillingPlanPayload();
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Failed to update billing settings", error: error.message });
  }
});

app.get("/admin/promo-codes", auth, requireAdmin, async (_req, res) => {
  try {
    if (!dbReady) {
      const sorted = [...memState.promoCodes].sort((a, b) => b.id - a.id);
      return res.json(sorted);
    }
    const r = await pool.query(
      `select id, code, discount_type, discount_value, max_uses, uses_count, expires_at, active, created_at, updated_at
       from promo_codes order by id desc`
    );
    res.json(r.rows.map(formatPromoRow));
  } catch (error) {
    res.status(500).json({ message: "Failed to list promo codes", error: error.message });
  }
});

app.post("/admin/promo-codes", auth, requireAdmin, async (req, res) => {
  const parsed = promoCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  const code = normalizePromoCode(parsed.data.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return res.status(400).json({ message: "Код: 3–32 символа, латиница, цифры, _ или -" });
  }

  const discountValue =
    parsed.data.discountType === "full" ? 100 : Number(parsed.data.discountValue || 0);
  if (parsed.data.discountType === "percent" && discountValue > 100) {
    return res.status(400).json({ message: "Процент скидки не может быть больше 100" });
  }

  const now = new Date().toISOString();

  try {
    if (!dbReady) {
      if (memState.promoCodes.some((p) => p.code === code)) {
        return res.status(409).json({ message: "Промокод уже существует" });
      }
      const row = {
        id: memPromoNextId++,
        code,
        discountType: parsed.data.discountType,
        discountValue,
        maxUses: parsed.data.maxUses ?? null,
        usesCount: 0,
        expiresAt: parsed.data.expiresAt ?? null,
        active: parsed.data.active,
        createdAt: now,
        updatedAt: now
      };
      memState.promoCodes.push(row);
      return res.status(201).json(row);
    }

    const created = await pool.query(
      `insert into promo_codes (code, discount_type, discount_value, max_uses, expires_at, created_by, active, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       returning id, code, discount_type, discount_value, max_uses, uses_count, expires_at, active, created_at, updated_at`,
      [
        code,
        parsed.data.discountType,
        discountValue,
        parsed.data.maxUses ?? null,
        parsed.data.expiresAt ?? null,
        req.user.userId,
        parsed.data.active
      ]
    );
    res.status(201).json(formatPromoRow(created.rows[0]));
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Промокод уже существует" });
    }
    res.status(500).json({ message: "Failed to create promo code", error: error.message });
  }
});

app.patch("/admin/promo-codes/:promoId", auth, requireAdmin, async (req, res) => {
  const id = Number(req.params.promoId);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  const parsed = promoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    if (!dbReady) {
      const idx = memState.promoCodes.findIndex((p) => p.id === id);
      if (idx < 0) return res.status(404).json({ message: "Not found" });
      const cur = memState.promoCodes[idx];
      const updated = {
        ...cur,
        active: parsed.data.active !== undefined ? parsed.data.active : cur.active,
        maxUses: parsed.data.maxUses !== undefined ? parsed.data.maxUses : cur.maxUses,
        expiresAt: parsed.data.expiresAt !== undefined ? parsed.data.expiresAt : cur.expiresAt,
        updatedAt: new Date().toISOString()
      };
      memState.promoCodes[idx] = updated;
      return res.json(updated);
    }

    const fields = [];
    const values = [];
    let p = 1;
    if (parsed.data.active !== undefined) {
      fields.push(`active = $${p++}`);
      values.push(parsed.data.active);
    }
    if (parsed.data.maxUses !== undefined) {
      fields.push(`max_uses = $${p++}`);
      values.push(parsed.data.maxUses);
    }
    if (parsed.data.expiresAt !== undefined) {
      fields.push(`expires_at = $${p++}`);
      values.push(parsed.data.expiresAt);
    }
    if (!fields.length) {
      const cur = await pool.query(
        `select id, code, discount_type, discount_value, max_uses, uses_count, expires_at, active, created_at, updated_at
         from promo_codes where id = $1`,
        [id]
      );
      if (!cur.rows[0]) return res.status(404).json({ message: "Not found" });
      return res.json(formatPromoRow(cur.rows[0]));
    }
    fields.push("updated_at = now()");
    values.push(id);
    const updated = await pool.query(
      `update promo_codes set ${fields.join(", ")} where id = $${p}
       returning id, code, discount_type, discount_value, max_uses, uses_count, expires_at, active, created_at, updated_at`,
      values
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Not found" });
    return res.json(formatPromoRow(updated.rows[0]));
  } catch (error) {
    res.status(500).json({ message: "Failed to update promo code", error: error.message });
  }
});

app.delete("/admin/promo-codes/:promoId", auth, requireAdmin, async (req, res) => {
  const id = Number(req.params.promoId);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    if (!dbReady) {
      const idx = memState.promoCodes.findIndex((p) => p.id === id);
      if (idx < 0) return res.status(404).json({ message: "Not found" });
      if (memState.promoCodes[idx].usesCount > 0) {
        return res.status(409).json({ message: "Нельзя удалить использованный промокод — деактивируйте его" });
      }
      memState.promoCodes.splice(idx, 1);
      return res.status(204).send();
    }

    const row = await pool.query(`select uses_count from promo_codes where id = $1`, [id]);
    if (!row.rows[0]) return res.status(404).json({ message: "Not found" });
    if (Number(row.rows[0].uses_count) > 0) {
      return res.status(409).json({ message: "Нельзя удалить использованный промокод — деактивируйте его" });
    }
    await pool.query(`delete from promo_codes where id = $1`, [id]);
    return res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to delete promo code", error: error.message });
  }
});

app.get("/admin/news", auth, requireAdmin, async (_req, res) => {
  try {
    if (!dbReady) {
      const sorted = [...memState.news].sort((a, b) => b.id - a.id);
      return res.json(sorted);
    }
    const r = await pool.query(
      `select id, title, slug, body, published,
              created_at as "createdAt", updated_at as "updatedAt"
       from news order by id desc`
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to list news", error: error.message });
  }
});

app.post("/admin/news", auth, requireAdmin, async (req, res) => {
  const parsed = newsCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }
  const slug = normalizeNewsSlug(parsed.data.slug);
  const now = new Date().toISOString();

  try {
    if (!dbReady) {
      if (memNewsSlugTaken(slug, 0)) {
        return res.status(409).json({ message: "Новость с таким slug уже есть" });
      }
      const row = {
        id: memNewsNextId++,
        title: parsed.data.title,
        slug,
        body: parsed.data.body ?? "",
        published: parsed.data.published,
        createdAt: now,
        updatedAt: now
      };
      memState.news.push(row);
      return res.status(201).json(row);
    }

    const created = await pool.query(
      `insert into news (title, slug, body, published, updated_at)
       values ($1, $2, $3, $4, now())
       returning id, title, slug, body, published, created_at as "createdAt", updated_at as "updatedAt"`,
      [parsed.data.title, slug, parsed.data.body ?? "", parsed.data.published]
    );
    res.status(201).json(created.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Новость с таким slug уже есть" });
    }
    res.status(500).json({ message: "Failed to create news", error: error.message });
  }
});

app.patch("/admin/news/:newsId", auth, requireAdmin, async (req, res) => {
  const id = Number(req.params.newsId);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  const parsed = newsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  const nextSlug = parsed.data.slug !== undefined ? normalizeNewsSlug(parsed.data.slug) : undefined;

  try {
    if (!dbReady) {
      const idx = memState.news.findIndex((n) => n.id === id);
      if (idx < 0) return res.status(404).json({ message: "Not found" });
      if (nextSlug !== undefined && memNewsSlugTaken(nextSlug, id)) {
        return res.status(409).json({ message: "Новость с таким slug уже есть" });
      }
      const cur = memState.news[idx];
      const updated = {
        ...cur,
        title: parsed.data.title ?? cur.title,
        slug: nextSlug !== undefined ? nextSlug : cur.slug,
        body: parsed.data.body !== undefined ? parsed.data.body : cur.body,
        published: parsed.data.published !== undefined ? parsed.data.published : cur.published,
        updatedAt: new Date().toISOString()
      };
      memState.news[idx] = updated;
      return res.json(updated);
    }

    const fields = [];
    const values = [];
    let p = 1;
    if (parsed.data.title !== undefined) {
      fields.push(`title = $${p++}`);
      values.push(parsed.data.title);
    }
    if (nextSlug !== undefined) {
      fields.push(`slug = $${p++}`);
      values.push(nextSlug);
    }
    if (parsed.data.body !== undefined) {
      fields.push(`body = $${p++}`);
      values.push(parsed.data.body);
    }
    if (parsed.data.published !== undefined) {
      fields.push(`published = $${p++}`);
      values.push(parsed.data.published);
    }
    if (!fields.length) {
      const cur = await pool.query(
        `select id, title, slug, body, published, created_at as "createdAt", updated_at as "updatedAt" from news where id = $1`,
        [id]
      );
      if (!cur.rows[0]) return res.status(404).json({ message: "Not found" });
      return res.json(cur.rows[0]);
    }
    fields.push(`updated_at = now()`);
    values.push(id);
    const q = `update news set ${fields.join(", ")} where id = $${p} returning id, title, slug, body, published, created_at as "createdAt", updated_at as "updatedAt"`;
    const result = await pool.query(q, values);
    if (!result.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Новость с таким slug уже есть" });
    }
    res.status(500).json({ message: "Failed to update news", error: error.message });
  }
});

app.delete("/admin/news/:newsId", auth, requireAdmin, async (req, res) => {
  const id = Number(req.params.newsId);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    if (!dbReady) {
      const before = memState.news.length;
      memState.news = memState.news.filter((n) => n.id !== id);
      if (memState.news.length === before) return res.status(404).json({ message: "Not found" });
      return res.status(204).send();
    }
    const del = await pool.query(`delete from news where id = $1`, [id]);
    if (!del.rowCount) return res.status(404).json({ message: "Not found" });
    return res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to delete news", error: error.message });
  }
});

app.get("/news", async (_req, res) => {
  try {
    if (!dbReady) {
      const pub = memState.news
        .filter((n) => n.published)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((n) => ({
          id: n.id,
          title: n.title,
          slug: n.slug,
          body: n.body,
          updatedAt: n.updatedAt
        }));
      return res.json(pub);
    }
    const r = await pool.query(
      `select id, title, slug, body, updated_at as "updatedAt"
       from news where published = true order by updated_at desc limit 100`
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to load news", error: error.message });
  }
});

app.get("/support/messages", auth, async (req, res) => {
  try {
    const currentRole = req.user?.role === "admin" ? "admin" : "student";
    const targetUserId =
      currentRole === "admin" && req.query.userId ? Number(req.query.userId) : Number(req.user.userId);
    const targetVideoId = req.query.videoId ? Number(req.query.videoId) : null;
    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    if (targetVideoId !== null && !Number.isFinite(targetVideoId)) {
      return res.status(400).json({ message: "Invalid videoId" });
    }

    const userMeta = await getUserPublicById(targetUserId);
    if (!userMeta) return res.status(404).json({ message: "User not found" });

    if (!dbReady) {
      const messages = memState.supportMessages
        .filter((m) => m.userId === targetUserId && (targetVideoId == null || Number(m.videoId) === targetVideoId))
        .sort((a, b) => a.id - b.id)
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          videoId: m.videoId ?? null,
          videoTitle: m.videoId ? getVideoTitleById(m.videoId) : null,
          senderRole: m.senderRole,
          text: m.text,
          createdAt: m.createdAt
        }));
      return res.json({ user: userMeta, messages });
    }

    let result;
    if (targetVideoId == null) {
      result = await pool.query(
        `select sm.id, sm.user_id as "userId", sm.video_id as "videoId", v.title as "videoTitle",
                sm.sender_role as "senderRole", sm.text, sm.created_at as "createdAt"
         from support_messages sm
         left join videos v on v.id = sm.video_id
         where sm.user_id = $1
         order by sm.created_at asc, sm.id asc`,
        [targetUserId]
      );
    } else {
      result = await pool.query(
        `select sm.id, sm.user_id as "userId", sm.video_id as "videoId", v.title as "videoTitle",
                sm.sender_role as "senderRole", sm.text, sm.created_at as "createdAt"
         from support_messages sm
         left join videos v on v.id = sm.video_id
         where sm.user_id = $1 and sm.video_id = $2
         order by sm.created_at asc, sm.id asc`,
        [targetUserId, targetVideoId]
      );
    }
    return res.json({ user: userMeta, messages: result.rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load support messages", error: error.message });
  }
});

app.post("/support/messages", auth, async (req, res) => {
  const parsed = supportMessageCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
  }

  try {
    const currentRole = req.user?.role === "admin" ? "admin" : "student";
    const targetUserId =
      currentRole === "admin" && req.body?.userId ? Number(req.body.userId) : Number(req.user.userId);
    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const userMeta = await getUserPublicById(targetUserId);
    if (!userMeta) return res.status(404).json({ message: "User not found" });

    const cleanText = parsed.data.text.trim();
    if (!cleanText) return res.status(400).json({ message: "Message is empty" });
    const targetVideoId = parsed.data.videoId ?? null;

    if (targetVideoId !== null) {
      if (!dbReady) {
        if (!getVideoTitleById(targetVideoId)) {
          return res.status(404).json({ message: "Video not found" });
        }
      } else {
        const videoResult = await pool.query(`select id from videos where id = $1`, [targetVideoId]);
        if (!videoResult.rows[0]) {
          return res.status(404).json({ message: "Video not found" });
        }
      }
    }

    if (!dbReady) {
      const row = {
        id: memSupportMessageNextId++,
        userId: targetUserId,
        videoId: targetVideoId,
        senderRole: currentRole,
        text: cleanText,
        createdAt: new Date().toISOString()
      };
      memState.supportMessages.push(row);
      return res.status(201).json(row);
    }

    const created = await pool.query(
      `insert into support_messages (user_id, video_id, sender_role, text)
       values ($1, $2, $3, $4)
       returning id, user_id as "userId", video_id as "videoId", sender_role as "senderRole", text, created_at as "createdAt"`,
      [targetUserId, targetVideoId, currentRole, cleanText]
    );
    return res.status(201).json(created.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to send support message", error: error.message });
  }
});

app.post("/support/mark-read", auth, async (req, res) => {
  try {
    const currentRole = req.user?.role === "admin" ? "admin" : "student";
    const targetUserId =
      currentRole === "admin" && req.body?.userId ? Number(req.body.userId) : Number(req.user.userId);
    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }
    const userMeta = await getUserPublicById(targetUserId);
    if (!userMeta) return res.status(404).json({ message: "User not found" });
    await setSupportLastRead(targetUserId, currentRole);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark messages as read", error: error.message });
  }
});

app.get("/support/unread", auth, async (req, res) => {
  try {
    const currentRole = req.user?.role === "admin" ? "admin" : "student";
    if (currentRole === "student") {
      const userId = Number(req.user.userId);
      const lastRead = await getSupportLastRead(userId, "student");
      if (!dbReady) {
        const total = memState.supportMessages.filter(
          (m) => m.userId === userId && m.senderRole === "admin" && (!lastRead || m.createdAt > lastRead)
        ).length;
        return res.json({ total });
      }
      const result = await pool.query(
        `select count(*)::int as total
         from support_messages
         where user_id = $1
           and sender_role = 'admin'
           and ($2::timestamptz is null or created_at > $2::timestamptz)`,
        [userId, lastRead]
      );
      return res.json({ total: result.rows[0]?.total || 0 });
    }

    if (!dbReady) {
      const candidates = [demoUser, ...Array.from(memRegisteredUsersById.values())];
      const byUser = [];
      for (const u of candidates) {
        const lastRead = await getSupportLastRead(u.id, "admin");
        const count = memState.supportMessages.filter(
          (m) => m.userId === u.id && m.senderRole === "student" && (!lastRead || m.createdAt > lastRead)
        ).length;
        if (count > 0) byUser.push({ userId: u.id, count });
      }
      const total = byUser.reduce((sum, item) => sum + item.count, 0);
      return res.json({ total, byUser });
    }

    const usersResult = await pool.query(`select id from users where subscription_type <> 'admin' order by id`);
    const byUser = [];
    for (const row of usersResult.rows) {
      const userId = row.id;
      const lastRead = await getSupportLastRead(userId, "admin");
      const countResult = await pool.query(
        `select count(*)::int as total
         from support_messages
         where user_id = $1
           and sender_role = 'student'
           and ($2::timestamptz is null or created_at > $2::timestamptz)`,
        [userId, lastRead]
      );
      const count = countResult.rows[0]?.total || 0;
      if (count > 0) byUser.push({ userId, count });
    }
    const total = byUser.reduce((sum, item) => sum + item.count, 0);
    return res.json({ total, byUser });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load unread counters", error: error.message });
  }
});

app.post("/auth/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  try {
    const payload = jwt.verify(parsed.data.refreshToken, jwtRefreshSecret);
    if (payload.type !== "refresh") return res.status(401).json({ message: "Invalid token type" });

    const user = dbReady ? await pool.query(`select * from users where id = $1`, [payload.userId]) : null;

    const stored = await getRefreshToken(payload.userId, payload.deviceId);
    if (dbReady) {
      if (!stored || new Date(stored.expires_at) < new Date()) {
        return res.status(401).json({ message: "Refresh token expired" });
      }
      const matches = await bcrypt.compare(parsed.data.refreshToken, stored.token_hash);
      if (!matches) return res.status(401).json({ message: "Refresh token revoked" });
    } else if (!stored || stored !== parsed.data.refreshToken) {
      return res.status(401).json({ message: "Refresh token revoked" });
    }

    let authUser;
    if (dbReady) {
      if (!user.rows[0]) {
        return res.status(401).json({ message: "User not found" });
      }
      if (user.rows[0].banned) {
        await revokeAllUserSessions(payload.userId);
        return res.status(403).json({ message: "Аккаунт заблокирован" });
      }
      authUser = {
        id: user.rows[0].id,
        email: user.rows[0].email,
        subscriptionType: user.rows[0].subscription_type
      };
    } else {
      authUser = getAuthUserForRefresh(payload.userId);
      if (!authUser) {
        return res.status(401).json({ message: "User not found" });
      }
      if (await isUserBanned(payload.userId)) {
        await revokeAllUserSessions(payload.userId);
        return res.status(403).json({ message: "Аккаунт заблокирован" });
      }
    }

    const token = signAccessToken(authUser);
    const nextRefresh = signRefreshToken(authUser, payload.deviceId);
    await storeRefreshToken(payload.userId, payload.deviceId, nextRefresh);

    return res.json({ token, refreshToken: nextRefresh });
  } catch {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

app.post("/auth/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  try {
    const payload = jwt.verify(parsed.data.refreshToken, jwtRefreshSecret);
    await deleteRefreshToken(payload.userId, payload.deviceId);
    return res.status(204).send();
  } catch {
    return res.status(204).send();
  }
});

app.get("/chapters", auth, (req, res) => {
  fetchChaptersForUser(req.user.userId)
    .then((items) => res.json(items))
    .catch((error) => res.status(500).json({ message: "Failed to load chapters", error: error.message }));
});

app.get("/progress", auth, async (req, res) => {
  try {
    const progress = await fetchProgress(req.user.userId);
    const completedCount =
      typeof progress.completedCount === "number"
        ? progress.completedCount
        : Object.values(progress.videoCompleted || {}).filter(Boolean).length ||
          Object.values(progress.watchedSeconds).filter((sec) => sec >= 600).length;

    res.json({
      lastVideoId: progress.lastVideoId,
      completedCount,
      totalVideos: progress.totalVideos,
      percentage: progress.totalVideos ? Math.round((completedCount / progress.totalVideos) * 100) : 0,
      watchedSeconds: progress.watchedSeconds,
      videoCompleted: progress.videoCompleted || {}
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load progress", error: error.message });
  }
});

app.post("/videos/:videoId/position", auth, async (req, res) => {
  const videoId = Number(req.params.videoId);
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  try {
    await saveProgress(
      req.user.userId,
      videoId,
      parsed.data.watchedSeconds,
      Boolean(parsed.data.completed)
    );
  } catch (error) {
    return res.status(500).json({ message: "Failed to save progress", error: error.message });
  }

  res.status(204).send();
});

app.post("/videos/:videoId/access-token", auth, async (req, res) => {
  const videoId = Number(req.params.videoId);
  const allowed = await canUserWatchVideo(req.user.userId, videoId);
  if (!allowed) {
    return res.status(403).json({
      message: "Для просмотра этого урока нужна подписка",
      code: "subscription_required"
    });
  }

  const deviceId = getDeviceFromRequest(req);
  const origin = getOrigin(req);
  const originOk = origin && allowedOrigins.includes(origin);

  const token = jwt.sign(
    {
      userId: req.user.userId,
      videoId,
      type: "video-access",
      deviceId,
      origin: originOk ? origin : ""
    },
    jwtSecret,
    { expiresIn: "5m" }
  );

  res.json({ token, expiresIn: 300 });
});

function getUploadFilenameFromStreamPath(streamPath) {
  if (!streamPath) return null;
  if (streamPath.startsWith("upload:")) return streamPath.slice("upload:".length);
  if (streamPath.startsWith("/uploads/")) return streamPath.slice("/uploads/".length);
  return null;
}

function isProtectedHlsStreamPath(streamPath) {
  return Boolean(streamPath?.startsWith("hls:"));
}

function isLegacyDemoStreamPath(streamPath) {
  return Boolean(streamPath?.startsWith("hls/"));
}

async function queueHlsPackaging(videoId, inputPath, sourceFilename) {
  if (hlsPackaging.has(videoId)) return hlsPackaging.get(videoId);
  const job = (async () => {
    try {
      await packageVideoToHls(videoId, inputPath);
      const outDir = getHlsDir(videoId);
      if (sourceFilename) {
        await writeFile(path.join(outDir, "source.txt"), sourceFilename, "utf8");
      }
      if (dbReady) {
        await pool.query(`update videos set stream_path = $2 where id = $1`, [videoId, `hls:${videoId}`]);
      }
      console.log(`[hls] Video ${videoId} ready (AES-128)`);
    } catch (error) {
      console.error(`[hls] Video ${videoId} packaging failed:`, error.message);
    } finally {
      hlsPackaging.delete(videoId);
    }
  })();
  hlsPackaging.set(videoId, job);
  return job;
}

async function resolveSourceMp4ForVideo(videoId, streamPath) {
  const fromUpload = getUploadFilenameFromStreamPath(streamPath);
  if (fromUpload) return path.join(uploadsDir, fromUpload);
  if (isProtectedHlsStreamPath(streamPath)) {
    try {
      const name = (await readFile(path.join(getHlsDir(videoId), "source.txt"), "utf8")).trim();
      if (name) return path.join(uploadsDir, name);
    } catch {
      /* no source metadata */
    }
  }
  return null;
}

// Прямая выдача MP4 отключена — только зашифрованный HLS.
app.get("/media/:videoId", (_req, res) => {
  res.status(403).json({ message: "Direct download disabled. Use HLS stream." });
});

app.get("/hls/:videoId/manifest.m3u8", async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!verifyVideoAccessForHls(req, res, videoId)) return;

  const accessToken = String(req.query.token || "");
  const deviceId = getDeviceFromRequest(req);

  if (await isHlsReady(videoId)) {
    try {
      setStreamCors(req, res);
      const body = await buildAuthenticatedManifest(videoId, req, accessToken, deviceId);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(body);
    } catch (error) {
      return res.status(500).json({ message: "Failed to load HLS manifest", error: error.message });
    }
  }

  const query = new URLSearchParams({
    token: accessToken,
    did: deviceId
  }).toString();
  const host = `${req.protocol}://${req.get("host")}`;
  const segment0 = `${host}/hls/${videoId}/segment_000.ts?${query}`;
  const segment1 = `${host}/hls/${videoId}/segment_001.ts?${query}`;
  const body = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXTINF:6.0,",
    segment0,
    "#EXTINF:6.0,",
    segment1,
    "#EXT-X-ENDLIST"
  ].join("\n");

  setStreamCors(req, res);
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "private, max-age=30");
  res.send(body);
});

app.get("/hls/:videoId/segments/:segmentName", async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!verifyVideoAccessForHls(req, res, videoId)) return;

  const segmentName = safeSegmentName(req.params.segmentName);
  if (!segmentName) return res.status(400).json({ message: "Invalid segment" });

  const filePath = path.join(getHlsDir(videoId), segmentName);
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return res.status(404).json({ message: "Segment not found" });
  }

  setStreamCors(req, res);
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", fileStat.size);
  return createReadStream(filePath).pipe(res);
});

app.get("/hls/:videoId/segment_000.ts", (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!verifyVideoAccessForHls(req, res, videoId)) return;
  res.redirect(302, `${demoHlsRemoteBase}/fileSequence0.ts`);
});

app.get("/hls/:videoId/segment_001.ts", (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!verifyVideoAccessForHls(req, res, videoId)) return;
  res.redirect(302, `${demoHlsRemoteBase}/fileSequence1.ts`);
});

app.get("/hls/:videoId/key", async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!verifyVideoAccessForHls(req, res, videoId)) return;

  const keyPath = path.join(getHlsDir(videoId), "enc.key");
  try {
    const key = await readFile(keyPath);
    setStreamCors(req, res);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.send(key);
  } catch {
    const token = String(req.query.token || "");
    if (!token) return res.status(401).json({ message: "Missing key token" });

    try {
      const payload = jwt.verify(token, hlsKeySecret);
      if (payload.type !== "hls-key" || Number(payload.videoId) !== videoId) {
        return res.status(401).json({ message: "Invalid key token" });
      }
    } catch {
      return res.status(401).json({ message: "Invalid key token" });
    }

    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.send(key);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File too large (max 1 GB)" : err.message;
    return res.status(413).json({ message });
  }
  return next(err);
});

async function migrateUploadVideosToHls() {
  if (!pool) return;
  const result = await pool.query(`select id, stream_path from videos where stream_path like 'upload:%'`);
  for (const row of result.rows) {
    const filename = getUploadFilenameFromStreamPath(row.stream_path);
    if (!filename) continue;
    const inputPath = path.join(uploadsDir, filename);
    try {
      await access(inputPath);
    } catch {
      continue;
    }
    void queueHlsPackaging(row.id, inputPath, filename);
  }
}

function formatRedisConnectError(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  if (err.code) return String(err.code);
  if (Array.isArray(err.errors) && err.errors.length) {
    const first = err.errors[0];
    if (first?.code) return String(first.code);
    if (first?.message) return String(first.message);
  }
  const msg = err.message?.trim();
  return msg || err.name || "connection failed";
}

async function start() {
  if (redis) {
    const onRedisRuntimeError = (err) => {
      console.warn("[redis]", formatRedisConnectError(err));
    };
    try {
      await redis.connect();
      console.log("Redis connected");
      redis.on("error", onRedisRuntimeError);
    } catch (error) {
      console.log(
        "Redis недоступен — refresh-токены в памяти. Чтобы включить Redis, поднимите сервер или удалите REDIS_URL из .env. Причина:",
        formatRedisConnectError(error)
      );
      try {
        await redis.disconnect();
      } catch {
        /* уже отключён */
      }
    }
  }

  if (pool) {
    try {
      await pool.query("select 1");
      try {
        await ensureNewsTable();
      } catch (e) {
        console.error("Таблица news / индекс — пропуск (проверьте миграцию):", e.message);
      }
      try {
        await ensureSupportMessagesTable();
      } catch (e) {
        console.error("Таблица support_messages / индекс — пропуск (проверьте миграцию):", e.message);
      }
      try {
        await ensureSupportReadsTable();
      } catch (e) {
        console.error("Таблица support_reads — пропуск (проверьте миграцию):", e.message);
      }
      try {
        await ensurePaymentsTable();
      } catch (e) {
        console.error("Таблица payments — пропуск (проверьте миграцию):", e.message);
      }
      try {
        await ensurePromoCodesTable();
      } catch (e) {
        console.error("Таблица promo_codes — пропуск (проверьте миграцию):", e.message);
      }
      try {
        await ensureAppSettingsTable();
      } catch (e) {
        console.error("Таблица app_settings — пропуск (проверьте миграцию):", e.message);
      }
      await seedDemoData();
      dbReady = true;
      await migrateUploadVideosToHls();
      console.log("PostgreSQL connected");
    } catch (error) {
      dbReady = false;
      console.error("PostgreSQL init failed — работаем без БД (in-memory):", error.message);
      if (error.stack) console.error(error.stack);
    }
  }

  const server = app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
  server.on("error", (err) => {
    console.error(`Не удалось занять порт ${port}:`, err.code || err.message);
    if (err.code === "EADDRINUSE") {
      console.error("Остановите другой процесс на этом порту или задайте переменную PORT в .env");
    }
    process.exit(1);
  });
}

start().catch((error) => {
  console.error("Критическая ошибка при старте:", error);
  process.exit(1);
});
