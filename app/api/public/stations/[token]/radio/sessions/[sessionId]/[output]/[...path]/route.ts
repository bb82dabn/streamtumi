import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string; sessionId: string; output: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-radio-media", 1200, 60);
    const { token, sessionId, output, path } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || (output !== "audio" && output !== "waveform")) throw new HttpError(404, "Radio media not found.", "NOT_FOUND");
    const relative = path.join("/");
    if (relative !== "index.m3u8" && !/^segment_\d{10}\.ts$/.test(relative)) throw new HttpError(404, "Radio media not found.", "NOT_FOUND");
    const station = await resolvePublicStation(token, request);
    if (station.station_kind !== "RADIO" || station.broadcast_state !== "RUNNING") throw new HttpError(404, "Radio station not found.", "NOT_FOUND");
    const session = await query<{ object_prefix: string }>(
      `SELECT object_prefix FROM radio_playout_sessions
        WHERE id = $1 AND station_id = $2
          AND (status = 'ACTIVE' OR (status = 'RETIRED' AND retired_at > now() - interval '2 minutes'))`,
      [sessionId, station.id],
    );
    const prefix = session.rows[0]?.object_prefix;
    if (!prefix) throw new HttpError(404, "Radio session not found.", "NOT_FOUND");
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, Date.now(), station.room_access_generation ?? "legacy") ?? undefined
      : undefined;
    return objectResponse(
      `${prefix}/${output}/${relative}`,
      request,
      relative.endsWith(".m3u8") ? "private, no-store" : "private, max-age=86400, immutable",
      grant,
    );
  } catch (error) {
    return jsonError(error);
  }
}
