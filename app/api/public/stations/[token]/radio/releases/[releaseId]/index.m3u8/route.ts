import { query } from "@/lib/db";
import { HttpError, jsonError } from "@/lib/http";
import { rewriteHlsPlaylist } from "@/lib/media";
import { mobilePlaybackGrantFromRequest } from "@/lib/mobile-playback-grant";
import { resolvePublicStation } from "@/lib/public-access";
import { rateLimit } from "@/lib/rate-limit";
import { buildVirtualRadioManifest } from "@/lib/radio-delivery";

type Context = { params: Promise<{ token: string; releaseId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await rateLimit(request, "public-radio-media", 1200, 60);
    const { token, releaseId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(releaseId)) throw new HttpError(404, "Radio release not found.", "NOT_FOUND");
    const station = await resolvePublicStation(token, request);
    const handoverRelease = station.previous_clock_release_id === releaseId
      && Boolean(station.radio_release_changed_at && Date.now() - station.radio_release_changed_at.getTime() < 120_000);
    if (station.station_kind !== "RADIO" || station.broadcast_state !== "RUNNING" || station.radio_delivery_mode !== "STATIC_HLS" || (station.active_clock_release_id !== releaseId && !handoverRelease)) {
      throw new HttpError(404, "Radio release not found.", "NOT_FOUND");
    }
    const manifest = await buildVirtualRadioManifest({ query }, releaseId, token);
    const grant = station.access_password_hash || station.room_access_generation
      ? mobilePlaybackGrantFromRequest(request, token, station.id, Date.now(), station.room_access_generation ?? "legacy")
      : null;
    return new Response(grant ? rewriteHlsPlaylist(manifest, grant) : manifest, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
