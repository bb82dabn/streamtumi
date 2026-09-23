import { isIP } from "node:net";
import { z } from "zod";

function commaSeparated(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function validHost(value: string): boolean {
  if (isIP(value)) return true;
  if (value.length > 253) return false;
  return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function validHostList(value: string): boolean {
  const hosts = commaSeparated(value);
  return hosts.length > 0 && hosts.every(validHost);
}

const productionSecretPlaceholders = new Set([
  "replace-with-at-least-32-random-characters",
  "build-only-secret-with-at-least-32-characters",
  "test-secret-with-at-least-32-characters",
]);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_INTERNAL_HOSTS: z.string().default(""),
  APP_SECRET: z.string().min(32),
  ALLOW_INSECURE_HTTP: z.enum(["true", "false"]).default("false"),
  APPLE_APP_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  ANDROID_APP_CERT_SHA256: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SMTP_HOST: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SMTP_PASSWORD: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  EMAIL_FROM: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).max(320).optional()),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_PORT: z.coerce.number().int().positive().default(9000),
  S3_USE_SSL: z.enum(["true", "false"]).default("false"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3).default("streamtumi"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(2_147_483_648),
  REGISTRATION_ENABLED: z.enum(["true", "false"]).default("true"),
  YOUTUBE_IMPORT_ENABLED: z.enum(["true", "false"]).default("true"),
  YOUTUBE_IMPORT_MAX_DURATION_SECONDS: z.coerce.number().int().min(1).max(86_400).default(21_600),
  YOUTUBE_IMPORT_METADATA_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
  YOUTUBE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(14_400).default(3_600),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  GUIDE_CATALOG_CACHE_SECONDS: z.coerce.number().int().min(0).max(300).default(5),
  CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REPORT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
  STATION_DELETE_GRACE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  TRANSCODE_ACCELERATION: z.enum(["auto", "nvenc", "cpu"]).default("auto"),
  TRANSCODE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  TRANSCODE_NVENC_PRESET: z.enum(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]).default("p1"),
  TRANSCODE_CPU_PRESET: z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]).default("ultrafast"),
  TRANSCODE_DOWNLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(8),
  TRANSCODE_UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(8),
  RADIO_PREP_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  RADIO_PREP_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(28_800).default(7_200),
  RADIO_TRACK_MAX_DURATION_SECONDS: z.coerce.number().int().min(1).max(86_400).default(21_600),
  RADIO_PLAYOUT_MAX_STATIONS: z.coerce.number().int().min(1).max(100).default(2),
  RADIO_PLAYOUT_LEASE_SECONDS: z.coerce.number().int().min(10).max(120).default(20),
  RADIO_PLAYOUT_RECONCILE_SECONDS: z.coerce.number().int().min(2).max(60).default(5),
  RADIO_HLS_SEGMENT_SECONDS: z.coerce.number().int().min(2).max(10).default(4),
  RADIO_STATIC_HLS_SEGMENT_SECONDS: z.coerce.number().int().min(1).max(4).default(1),
  TV_PLAYOUT_MAX_STATIONS: z.coerce.number().int().min(1).max(100).default(2),
  TV_PLAYOUT_LEASE_SECONDS: z.coerce.number().int().min(10).max(120).default(20),
  TV_PLAYOUT_RECONCILE_SECONDS: z.coerce.number().int().min(1).max(60).default(2),
  TV_SEGMENT_JOURNAL_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(7),
  WEATHERSTAR_URL: z.string().url().default("http://ws4kp:8080"),
  WEATHER_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  WEATHER_RENDER_IDLE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  WEATHER_RENDER_STARTUP_SECONDS: z.coerce.number().int().min(15).max(300).default(120),
  WEATHER_RENDER_FRAME_RATE: z.coerce.number().int().min(5).max(30).default(10),
  WEATHER_CHROMIUM_PATH: z.string().min(1).default("/usr/bin/chromium"),
}).superRefine((value, context) => {
  if (value.APP_INTERNAL_HOSTS && !validHostList(value.APP_INTERNAL_HOSTS)) {
    context.addIssue({ code: "custom", path: ["APP_INTERNAL_HOSTS"], message: "Must be a comma-separated list of IP addresses or DNS names." });
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
    context.addIssue({ code: "custom", path: ["SMTP_PASSWORD"], message: "SMTP_USER and SMTP_PASSWORD must be configured together." });
  }
  if (value.SMTP_HOST && !value.EMAIL_FROM) {
    context.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "Required when SMTP_HOST is configured." });
  }
  if (value.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const appUrl = new URL(value.APP_URL);
    const loopback = appUrl.hostname === "localhost"
      || appUrl.hostname.endsWith(".localhost")
      || isIP(appUrl.hostname) === 4 && appUrl.hostname.startsWith("127.");
    const localHttp = value.ALLOW_INSECURE_HTTP === "true" && loopback && appUrl.protocol === "http:";
    if (appUrl.protocol !== "https:" && !localHttp) {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "Must use HTTPS in production." });
    }
    if (appUrl.username || appUrl.password || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "Must be an origin without credentials, a path, query, or fragment." });
    }
    if (loopback && !localHttp) {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "Must not use a loopback host in production." });
    }
    if (value.APP_SECRET.length < 48 || productionSecretPlaceholders.has(value.APP_SECRET)) {
      context.addIssue({ code: "custom", path: ["APP_SECRET"], message: "Must be at least 48 random characters and not a documented placeholder in production." });
    }
  }
});

type RawAppEnv = z.infer<typeof schema>;
export type AppEnv = Omit<RawAppEnv, "ALLOW_INSECURE_HTTP" | "SMTP_SECURE" | "S3_USE_SSL" | "REGISTRATION_ENABLED" | "YOUTUBE_IMPORT_ENABLED"> & {
  ALLOW_INSECURE_HTTP: boolean;
  SMTP_SECURE: boolean;
  S3_USE_SSL: boolean;
  REGISTRATION_ENABLED: boolean;
  YOUTUBE_IMPORT_ENABLED: boolean;
};

let cached: AppEnv | undefined;

export function env(): AppEnv {
  if (cached) return cached;
  const buildDefaults = process.env.NEXT_PHASE === "phase-production-build"
    ? {
        APP_SECRET: "build-only-secret-with-at-least-32-characters",
        DATABASE_URL: "postgresql://build:build@localhost:5432/build",
        REDIS_URL: "redis://localhost:6379",
        S3_ENDPOINT: "localhost",
        S3_ACCESS_KEY: "build",
        S3_SECRET_KEY: "build-secret",
      }
    : {};
  const result = schema.safeParse({ ...buildDefaults, ...process.env });
  if (!result.success) {
    throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`);
  }
  cached = {
    ...result.data,
    ALLOW_INSECURE_HTTP: result.data.ALLOW_INSECURE_HTTP === "true",
    SMTP_SECURE: result.data.SMTP_SECURE === "true",
    S3_USE_SSL: result.data.S3_USE_SSL === "true",
    REGISTRATION_ENABLED: result.data.REGISTRATION_ENABLED === "true",
    YOUTUBE_IMPORT_ENABLED: result.data.YOUTUBE_IMPORT_ENABLED === "true",
  };
  return cached;
}
