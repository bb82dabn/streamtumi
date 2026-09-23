import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("canonical media worker", () => {
  let source: string;

  beforeAll(async () => {
    source = await readFile(path.join(process.cwd(), "src-media-worker.ts"), "utf8");
  });

  it("claims the durable row with a renewable token and gates final writes on the winner", () => {
    expect(source).toMatch(/UPDATE media_processing_jobs SET status = 'RUNNING', claim_token = \$2/);
    expect(source).toMatch(/attempt_count = attempt_count \+ 1/);
    expect(source).toMatch(/status = 'RUNNING' AND claim_token = \$3[\s\S]*FOR UPDATE/);
    expect(source).toMatch(/media_processing_jobs job[\s\S]*job\.claim_token = \$17/);
    expect(source).toMatch(/lease_expires_at = now\(\) \+ \(\$3 \* interval '1 second'\)/);
    expect(source).toContain("startLeaseRenewal(clip)");
    expect(source).toContain("startLeaseRenewal(upload)");
  });

  it("uses one claim-fenced failure path and preserves retryable clip state", () => {
    expect(source).toMatch(/async function finishFailedClaim[\s\S]*status = 'RUNNING' AND claim_token = \$2 FOR UPDATE/);
    expect(source).toMatch(/finalAttempt \? "FAILED" : "QUEUED"/);
    expect(source).toContain('finishFailedClaim(clip, error, "Clip processing failed."');
    expect(source).toMatch(/if \(finalAttempt && finished\.rowCount\) await onFinalFailure/);
  });

  it("assembles only exact, checksummed 512 KiB receipts under owner keys", () => {
    const uploadProcessor = source.slice(source.indexOf("async function processMediaJob"), source.indexOf("async function dispatchMediaJob"));
    expect(source).toContain("UPLOAD_CHUNK_SIZE_BYTES");
    expect(source).toContain("ownerMediaPartKey(upload.uploadPrefix, part.part_number)");
    expect(source).toMatch(/body\.length !== expectedSize \|\| partHash !== part\.checksum_sha256/);
    expect(source).toContain("ownerMediaClaimPrefix(upload.ownerId, upload.assetId, upload.claimToken)");
    expect(uploadProcessor).not.toMatch(/stations\//);
    expect(uploadProcessor).not.toMatch(/\b(?:videos|radio_tracks|stations)\b/);
  });

  it("creates all canonical audio, video, and image variants", () => {
    expect(source).toContain('"-ar", "48000", "-ac", "2"');
    expect(source).toContain('"-c:a", "flac"');
    expect(source).toContain('"-c:a", "aac"');
    expect(source).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(source).toContain('renditions: ["360p", "720p"]');
    expect(source).toContain('role: "THUMBNAIL"');
    expect(source).toContain('role: "POSTER"');
    expect(source).toContain("sharp(source");
  });

  it("bounds media processing and removes claim output on every failure", () => {
    expect(source).toContain("expectedBytes > env().MAX_UPLOAD_BYTES");
    expect(source).toContain("durationSeconds > env().RADIO_TRACK_MAX_DURATION_SECONDS");
    expect(source).toContain("durationSeconds > env().YOUTUBE_IMPORT_MAX_DURATION_SECONDS");
    expect(source).toContain("timeoutSeconds = env().RADIO_PREP_TIMEOUT_SECONDS");
    expect(source).toContain('process.kill(-child.pid, "SIGKILL")');
    expect(source).toMatch(/catch \(error\) \{\s*await cleanClaimOutput\(upload, outputPrefix\);/);
    expect(source).toContain("failed canonical processing claim");
  });

  it("dispatches and atomically publishes validated TV automation derivatives", () => {
    expect(source).toContain('job_type = \'PREPARE_TV_AUTOMATION\'');
    expect(source).toContain('type.rows[0]?.job_type === "PREPARE_TV_AUTOMATION"');
    expect(source).toMatch(/job_type IN \([^)]*'PREPARE_TV_AUTOMATION'/);
    expect(source).toContain("tvChannelV1Args(source, outputDirectory, Boolean(audioStream(probe)))");
    expect(source).toContain("validateTvChannelMasterPlaylist(master)");
    expect(source).toContain('validateTvChannelSegmentInventories({ "720p": highPlaylist, "360p": lowPlaylist })');
    expect(source).toContain("INSERT INTO tv_channel_delivery_descriptors");
    expect(source).toContain("INSERT INTO tv_channel_delivery_renditions");
    expect(source).toContain("INSERT INTO tv_channel_delivery_segments");
    expect(source).toContain("INSERT INTO tv_channel_derivatives");
    expect(source).toMatch(/INSERT INTO media_asset_variants[\s\S]*'TV_AUTOMATION'/);
    expect(source).toMatch(/SELECT id FROM media_processing_jobs[\s\S]*status = 'RUNNING' AND claim_token = \$3[\s\S]*FOR UPDATE/);
    expect(source).toContain("source_media_asset_variant_id");
    expect(source).toContain("media_asset_variant_id = $2");
    expect(source).toContain("UPDATE videos video SET duration_ms = $2");
    expect(source).toContain("publishAfterScheduleMutation(client, stationId)");
    expect(source).toContain("refreshStations.map(publishScheduleRefresh)");
  });

  it("is packaged as an independent media-processing worker", async () => {
    const [queue, packageJson, dockerfile, compose] = await Promise.all([
      readFile(path.join(process.cwd(), "lib/queue.ts"), "utf8"),
      readFile(path.join(process.cwd(), "package.json"), "utf8"),
      readFile(path.join(process.cwd(), "Dockerfile"), "utf8"),
      readFile(path.join(process.cwd(), "compose.yaml"), "utf8"),
    ]);
    expect(queue).toContain('new Queue<MediaProcessingJob>("media-processing"');
    expect(packageJson).toContain('"media-worker": "tsx src-media-worker.ts"');
    expect(dockerfile).toContain("/app/src-media-worker.ts ./src-media-worker.ts");
    expect(compose).toMatch(/  media-worker:[\s\S]*command: \["npm", "run", "media-worker"\]/);
  });

});
