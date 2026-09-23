import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("TV channel automatic rotation", () => {
  let transcodeWorker: string;
  let mediaWorker: string;

  beforeAll(async () => {
    [transcodeWorker, mediaWorker] = await Promise.all([
      readFile(path.join(process.cwd(), "src-worker.ts"), "utf8"),
      readFile(path.join(process.cwd(), "src-media-worker.ts"), "utf8"),
    ]);
  });

  it("projects each completed channel upload and durably queues its derivative", () => {
    expect(transcodeWorker).toContain('video.tv_delivery_mode === "CHANNEL_HLS"');
    expect(transcodeWorker).toContain("projectLegacyVideoMediaAsset(client, mediaSchema, video.id)");
    expect(transcodeWorker).toContain("'PREPARE_TV_AUTOMATION'");
    expect(transcodeWorker).toContain("ON CONFLICT (media_asset_id, job_type, idempotency_key) DO UPDATE");
    expect(transcodeWorker).toContain("getMediaProcessingQueue().add(");
  });

  it("publishes the rotation only after exact channel media is committed", () => {
    const durationUpdate = mediaWorker.indexOf("UPDATE videos video SET duration_ms = $2");
    const publication = mediaWorker.indexOf("publishAfterScheduleMutation(client, stationId)");
    expect(durationUpdate).toBeGreaterThan(0);
    expect(publication).toBeGreaterThan(durationUpdate);
    expect(mediaWorker).toContain("station.tv_delivery_mode = 'CHANNEL_HLS'");
    expect(mediaWorker).toContain("EXISTS (SELECT 1 FROM playlist_items item");
  });
});
