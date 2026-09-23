import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
type EnvInput = Record<string, string | undefined>;
const baseEnv: EnvInput = {
  APP_SECRET: "test-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "localhost",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test-secret",
};

async function parseEnv(overrides: EnvInput = {}) {
  process.env = { ...originalEnv, ...baseEnv };
  delete process.env.NEXT_PHASE;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  const envModule = await import("@/lib/env");
  return envModule.env();
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("application environment validation", () => {
  it("defaults registration to enabled and strictly parses explicit values", async () => {
    await expect(parseEnv({ REGISTRATION_ENABLED: undefined })).resolves.toMatchObject({ REGISTRATION_ENABLED: true });
    await expect(parseEnv({ REGISTRATION_ENABLED: "false" })).resolves.toMatchObject({ REGISTRATION_ENABLED: false });
    await expect(parseEnv({ REGISTRATION_ENABLED: "true" })).resolves.toMatchObject({ REGISTRATION_ENABLED: true });
    await expect(parseEnv({ REGISTRATION_ENABLED: "1" })).rejects.toThrow(/REGISTRATION_ENABLED/);
  });

  it("allows insecure HTTP only for an explicitly enabled loopback deployment", async () => {
    await expect(parseEnv({
      NODE_ENV: "production",
      APP_URL: "http://localhost:3000",
      APP_SECRET: "random-production-secret-material-0123456789-ABCDEFGHIJ",
      ALLOW_INSECURE_HTTP: "true",
    })).resolves.toMatchObject({ ALLOW_INSECURE_HTTP: true });
    await expect(parseEnv({
      NODE_ENV: "production",
      APP_URL: "http://streamtumi.example",
      APP_SECRET: "random-production-secret-material-0123456789-ABCDEFGHIJ",
      ALLOW_INSECURE_HTTP: "true",
    })).rejects.toThrow(/APP_URL/);
  });

  it("rejects unsafe production URLs and placeholder secrets", async () => {
    const production = { NODE_ENV: "production", APP_SECRET: "x".repeat(48) };
    await expect(parseEnv({ ...production, APP_URL: "http://streamtumi.example" })).rejects.toThrow(/APP_URL/);
    await expect(parseEnv({ ...production, APP_URL: "https://localhost" })).rejects.toThrow(/APP_URL/);
    await expect(parseEnv({ ...production, APP_URL: "https://streamtumi.example/path" })).rejects.toThrow(/APP_URL/);
    await expect(parseEnv({ ...production, APP_URL: "https://streamtumi.example", APP_SECRET: "replace-with-at-least-32-random-characters" })).rejects.toThrow(/APP_SECRET/);
  });

  it("accepts a hardened production origin and random secret", async () => {
    await expect(parseEnv({
      NODE_ENV: "production",
      APP_URL: "https://streamtumi.example",
      APP_SECRET: "random-production-secret-material-0123456789-ABCDEFGHIJ",
    })).resolves.toMatchObject({ NODE_ENV: "production", APP_URL: "https://streamtumi.example" });
  });

  it("retains production build defaults without weakening runtime checks", async () => {
    await expect(parseEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).resolves.toMatchObject({ NODE_ENV: "production" });
  });

  it("bounds TV segment journal retention and defaults to seven days", async () => {
    await expect(parseEnv()).resolves.toMatchObject({ TV_SEGMENT_JOURNAL_RETENTION_DAYS: 7 });
    await expect(parseEnv({ TV_SEGMENT_JOURNAL_RETENTION_DAYS: "0" })).rejects.toThrow(/TV_SEGMENT_JOURNAL_RETENTION_DAYS/);
    await expect(parseEnv({ TV_SEGMENT_JOURNAL_RETENTION_DAYS: "3651" })).rejects.toThrow(/TV_SEGMENT_JOURNAL_RETENTION_DAYS/);
    await expect(parseEnv({ TV_SEGMENT_JOURNAL_RETENTION_DAYS: "1.5" })).rejects.toThrow(/TV_SEGMENT_JOURNAL_RETENTION_DAYS/);
  });
});
