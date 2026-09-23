import { randomUUID } from "node:crypto";
import { lockActiveUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { assertStationStorageAvailable } from "@/lib/storage-quota";
import { radioTrackChunkSourcePrefix } from "@/lib/upload-chunks";
import { safeUploadFilename } from "@/lib/upload-reservation";

type ExistingTrack = {
  id: string;
  source_file_name: string;
  mime_type: string;
  size_bytes: string;
  status: string;
};

export async function reserveRadioTrackUpload(input: {
  userId: string;
  stationId: string;
  uploadRequestId: string;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<{ trackId: string; status: string; created: boolean }> {
  const filename = safeUploadFilename(input.filename);
  return transaction(async (client) => {
    await lockActiveUser(client, input.userId);
    const station = await client.query(
      "SELECT id FROM stations WHERE id = $1 AND owner_id = $2 AND station_kind = 'RADIO' AND deleted_at IS NULL FOR UPDATE",
      [input.stationId, input.userId],
    );
    if (!station.rowCount) throw new HttpError(404, "Radio station not found.", "NOT_FOUND");

    const existing = await client.query<ExistingTrack>(
      "SELECT id, source_file_name, mime_type, size_bytes::text, status FROM radio_tracks WHERE station_id = $1 AND upload_request_id = $2",
      [input.stationId, input.uploadRequestId],
    );
    if (existing.rows[0]) {
      const track = existing.rows[0];
      if (track.source_file_name !== filename || track.mime_type !== input.mimeType || track.size_bytes !== String(input.size)) {
        throw new HttpError(409, "This upload request ID was already used for another track.", "UPLOAD_REQUEST_CONFLICT");
      }
      return { trackId: track.id, status: track.status, created: false };
    }

    await assertStationStorageAvailable(client, input.stationId, BigInt(input.size));
    const trackId = randomUUID();
    const title = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Untitled track";
    await client.query(
      `INSERT INTO radio_tracks
       (id, station_id, upload_request_id, title, source_key, source_file_name, mime_type, size_bytes,
        rights_attested_at, rights_attested_by, rights_attestation_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, 1)`,
      [trackId, input.stationId, input.uploadRequestId, title, radioTrackChunkSourcePrefix(input.stationId, trackId), filename, input.mimeType, input.size, input.userId],
    );
    return { trackId, status: "UPLOADING", created: true };
  });
}
