import { transaction } from "@/lib/db";
import { removePrefix } from "@/lib/storage";

export async function releaseInactiveVideoSource(videoId: string): Promise<boolean> {
  return transaction(async (client) => {
    const locked = await client.query<{ id: string; station_id: string }>(
      `SELECT v.id, v.station_id
         FROM videos v JOIN stations s ON s.id = v.station_id
        WHERE v.id = $1 AND v.status IN ('ARCHIVED', 'REPLACED')
          AND v.size_bytes > 0 AND s.legal_hold_at IS NULL
        FOR UPDATE OF s, v`,
      [videoId],
    );
    const video = locked.rows[0];
    if (!video) return false;
    await removePrefix(`stations/${video.station_id}/sources/${video.id}/`);
    await removePrefix(`stations/${video.station_id}/chunked-sources/${video.id}/`);
    await client.query(
      "UPDATE videos SET size_bytes = 0, updated_at = now() WHERE id = $1 AND status IN ('ARCHIVED', 'REPLACED')",
      [video.id],
    );
    return true;
  });
}
