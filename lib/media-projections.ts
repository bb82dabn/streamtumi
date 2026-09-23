import { randomUUID } from "node:crypto";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";

type AssetRow = {
  id: string;
  media_type: "AUDIO" | "VIDEO" | "IMAGE";
  status: string;
  title: string;
  original_file_name: string | null;
  mime_type: string | null;
  duration_ms: string | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  source_key: string | null;
  mezzanine_key: string | null;
  hls_key: string | null;
  thumbnail_key: string | null;
  artwork_key: string | null;
  quota_bytes: string;
};

export async function materializeMediaAsset(stationId: string, assetId: string, userId: string): Promise<{ kind: "TV" | "RADIO"; projectionId: string; created: boolean }> {
  let refreshTv = false;
  const result = await transaction(async (client) => {
    const station = await client.query<{ station_kind: "TV" | "RADIO" }>(
      "SELECT station_kind FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE",
      [stationId, userId],
    );
    const kind = station.rows[0]?.station_kind;
    if (!kind) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    const assetResult = await client.query<AssetRow>(
      `SELECT asset.id, asset.media_type, asset.status, asset.title, asset.original_file_name,
               asset.mime_type, asset.duration_ms::text, asset.width, asset.height, asset.metadata,
               asset.quota_bytes::text,
              (SELECT object_key FROM media_asset_variants WHERE media_asset_id = asset.id AND role = 'SOURCE' AND status = 'READY' ORDER BY generation DESC LIMIT 1) AS source_key,
              (SELECT object_key FROM media_asset_variants WHERE media_asset_id = asset.id AND role = 'MEZZANINE' AND status = 'READY' ORDER BY generation DESC LIMIT 1) AS mezzanine_key,
              (SELECT object_key FROM media_asset_variants WHERE media_asset_id = asset.id AND role = 'HLS_MANIFEST' AND status = 'READY' ORDER BY generation DESC LIMIT 1) AS hls_key,
              (SELECT object_key FROM media_asset_variants WHERE media_asset_id = asset.id AND role = 'THUMBNAIL' AND status = 'READY' ORDER BY generation DESC LIMIT 1) AS thumbnail_key,
              (SELECT object_key FROM media_asset_variants WHERE media_asset_id = asset.id AND role = 'ARTWORK' AND status = 'READY' ORDER BY generation DESC LIMIT 1) AS artwork_key
         FROM media_assets asset
        WHERE asset.id = $1 AND asset.owner_id = $2 AND asset.status IN ('READY', 'PARTIAL', 'ARCHIVED')
        `,
      [assetId, userId],
    );
    const asset = assetResult.rows[0];
    if (!asset) throw new HttpError(404, "Media asset not found.", "NOT_FOUND");
    await client.query(
      `INSERT INTO station_media_allocations (station_id, media_asset_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [stationId, assetId],
    );
    if (kind === "TV") {
      if (asset.media_type !== "VIDEO" || !asset.hls_key || !asset.duration_ms || !asset.width || !asset.height) throw new HttpError(409, "This asset is not ready for a TV station.", "MEDIA_PROJECTION_UNAVAILABLE");
      const existing = await client.query<{ id: string }>("SELECT id FROM videos WHERE station_id = $1 AND media_asset_id = $2", [stationId, assetId]);
      if (existing.rows[0]) return { kind, projectionId: existing.rows[0].id, created: false };
      const locked = await lockPublicationStation(client, stationId);
      const videoId = randomUUID();
      await client.query(
        `INSERT INTO videos
           (id, station_id, title, description, status, source_key, source_file_name, mime_type,
            size_bytes, duration_ms, width, height, hls_key, thumbnail_key, processing_progress,
            source_kind, media_asset_id, rights_attested_at, rights_attested_by, rights_attestation_version)
         VALUES ($1, $2, $3, '', 'READY', $4, $5, $6, 0, $7, $8, $9, $10, $11, 100,
                 'UPLOAD', $12, now(), $13, 1)`,
        [videoId, stationId, asset.title, asset.source_key ?? asset.hls_key, asset.original_file_name ?? `${asset.title}.mp4`, asset.mime_type ?? "video/mp4", asset.duration_ms, asset.width, asset.height, asset.hls_key, asset.thumbnail_key, assetId, userId],
      );
      await client.query(
        `INSERT INTO playlist_items (station_id, video_id, position, page, story_slug, planned_duration_ms)
         SELECT $1, $2, COALESCE(max(position) + 1, 0), COALESCE(max(page) + 1, 1), $3, $4
           FROM playlist_items WHERE station_id = $1`,
        [stationId, videoId, asset.title, asset.duration_ms],
      );
      await client.query("UPDATE stations SET playlist_version = playlist_version + 1, updated_at = now() WHERE id = $1", [stationId]);
      const publication = await publishAfterScheduleMutation(client, stationId);
      refreshTv = locked.promoted || publication.activeChanged;
      return { kind, projectionId: videoId, created: true };
    }
    if (asset.media_type !== "AUDIO" || !asset.mezzanine_key || !asset.hls_key || !asset.duration_ms) throw new HttpError(409, "This asset is not ready for a Radio station.", "MEDIA_PROJECTION_UNAVAILABLE");
    const existing = await client.query<{ id: string }>("SELECT id FROM radio_tracks WHERE station_id = $1 AND media_asset_id = $2", [stationId, assetId]);
    if (existing.rows[0]) return { kind, projectionId: existing.rows[0].id, created: false };
    const trackId = randomUUID();
    const artist = typeof asset.metadata.artist === "string" ? asset.metadata.artist.slice(0, 120) : "";
    const album = typeof asset.metadata.album === "string" ? asset.metadata.album.slice(0, 120) : "";
    await client.query(
      `INSERT INTO radio_tracks
         (id, station_id, upload_request_id, title, artist, album, status, source_key,
          source_file_name, mime_type, size_bytes, duration_ms, source_codec,
          source_sample_rate, source_channels, mezzanine_key, artwork_key, audio_hls_key,
          processing_progress, rights_attested_at, rights_attested_by, rights_attestation_version,
          media_asset_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'READY', $7, $8, $9, 0, $10, 'flac',
               48000, 2, $11, $12, $13, 100, now(), $14, 1, $15)`,
      [trackId, stationId, randomUUID(), asset.title.slice(0, 120), artist, album, asset.source_key ?? asset.mezzanine_key, asset.original_file_name ?? `${asset.title}.flac`, asset.mime_type ?? "audio/flac", asset.duration_ms, asset.mezzanine_key, asset.artwork_key, asset.hls_key, userId, assetId],
    );
    return { kind, projectionId: trackId, created: true };
  });
  if (refreshTv) await publishScheduleRefresh(stationId);
  return result;
}
