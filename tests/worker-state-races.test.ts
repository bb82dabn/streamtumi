import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("transcode worker state guards", () => {
  it("reclaims stalled jobs but never overwrites terminal video state", async () => {
    const source = await readFile(path.join(process.cwd(), "src-worker.ts"), "utf8");
    expect(source).toMatch(/WHERE id = \$1 AND status IN \('QUEUED', 'PROCESSING'\) RETURNING id/);
    expect(source).toMatch(/WHERE id = \$7 AND status = 'PROCESSING'/);
  });

  it("keeps imported downloads bounded and strips application secrets from yt-dlp", async () => {
    const source = await readFile(path.join(process.cwd(), "lib/youtube.ts"), "utf8");
    expect(source).toMatch(/downloadedBytes > maxBytes/);
    expect(source).toMatch(/childEnvironment\(\)/);
    expect(source).not.toMatch(/\.\.\.process\.env/);
    expect(source).toMatch(/shell: false/);
    expect(source).toMatch(/process\.kill\(-child\.pid, "SIGKILL"\)/);
  });

  it("makes deleted-station jobs retryable after restoration and rechecks actual duration", async () => {
    const source = await readFile(path.join(process.cwd(), "src-worker.ts"), "utf8");
    expect(source).toMatch(/Processing stopped because the station is scheduled for deletion/);
    expect(source).toMatch(/SET status = 'FAILED'/);
    expect(source).toMatch(/durationSeconds > env\(\)\.YOUTUBE_IMPORT_MAX_DURATION_SECONDS/);
  });

  it("uses separate typed parameters when persisting a failed import", async () => {
    const source = await readFile(path.join(process.cwd(), "src-worker.ts"), "utf8");
    expect(source).toMatch(/status = \$1::video_status/);
    expect(source).toMatch(/ingestion_status = CASE WHEN ingestion_status = 'PROCESSING' THEN \$2/);
    expect(source).toMatch(/size_bytes = CASE WHEN ingestion_status = 'PROCESSING' AND \$6::boolean THEN 0/);
    expect(source).toMatch(/sourceRetained = true/);
    expect(source).toMatch(/video\.source_kind === "YOUTUBE" && !sourceRetained/);
  });

  it("marks a replacement target only after replacing its playlist row", async () => {
    const source = await readFile(path.join(process.cwd(), "src-worker.ts"), "utf8");
    expect(source).toMatch(/if \(playlistChanged\) \{\s*await client\.query\("UPDATE videos SET status = 'REPLACED'/);
  });
});
