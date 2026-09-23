import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("standalone database baseline", () => {
  it("contains the retained local product surfaces", async () => {
    const sql = await source("sql/001_initial.sql");
    for (const table of [
      "users",
      "sessions",
      "stations",
      "videos",
      "radio_tracks",
      "radio_playout_state",
      "tv_segment_journal",
      "media_assets",
      "studio_projects",
      "calendar_releases",
      "mobile_refresh_tokens",
      "device_sessions",
      "weather_playback_sessions",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
    }
    expect(sql).toContain("'YOUTUBE'");
    expect(sql).toContain("'WEATHERSTAR_4000'");
    expect(sql).toContain("'ROKU'");
    expect(sql).toContain("password_hash text NOT NULL");
  });

  it("does not contain removed hosted or live-ingest schema", async () => {
    const sql = await source("sql/001_initial.sql");
    for (const removed of [
      "external_identities",
      "auth_exchange_codes",
      "radio_relay_sources",
      "radio_relay_metadata_events",
      "radio_studio_sessions",
      "tv_studio_sessions",
      "studio_live_runs",
      "SCHEDULED_LIVE",
      "STUDIO_RELEASE",
      "EXTERNAL_RELAY",
    ]) {
      expect(sql).not.toContain(removed);
    }
  });

  it("tracks immutable migration checksums outside the baseline", async () => {
    const [sql, runner] = await Promise.all([
      source("sql/001_initial.sql"),
      source("scripts/migrate.ts"),
    ]);
    expect(sql).not.toContain("CREATE TABLE public.schema_migrations");
    expect(runner).toContain("checksum text NOT NULL");
    expect(runner).toContain('createHash("sha256")');
    expect(runner).toContain("Applied migration ${file} has changed.");
  });
});
