import { NextResponse } from "next/server";
import { lockActiveUser, requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { stationSchema } from "@/lib/validation";
import { newAccessToken, viewerUrl } from "@/lib/stations";
import { activeGenreId } from "@/lib/genres";
import { rateLimitByKey } from "@/lib/rate-limit";
import type { StationKind } from "@/lib/station-kind";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const requestedKind = new URL(request.url).searchParams.get("kind");
    if (requestedKind !== null && requestedKind !== "TV" && requestedKind !== "RADIO") {
      throw new HttpError(400, "Station kind must be TV or RADIO.", "VALIDATION_ERROR");
    }
    const stationKind = requestedKind as StationKind | null;
    const result = await query(
      `SELECT s.id, s.name, s.description, s.station_kind, s.programming_mode, s.time_zone,
              'SYNCHRONIZED'::text AS mode, s.access_enabled, s.broadcast_state, s.updated_at, s.visibility,
              s.genre_id, g.name AS genre_name,
              ((SELECT count(*) FROM videos v WHERE v.station_id = s.id AND v.status = 'READY')
                + (SELECT count(*) FROM radio_tracks t WHERE t.station_id = s.id AND t.status = 'READY'))::int AS ready_count,
              (SELECT quota_bytes::text FROM station_media_storage_usage_v WHERE station_id = s.id) AS storage_bytes
         FROM stations s JOIN station_genres g ON g.id = s.genre_id
        WHERE s.owner_id = $1 AND ($2::station_kind IS NULL OR s.station_kind = $2)
          AND s.deleted_at IS NULL
          AND COALESCE(s.playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')
        ORDER BY s.updated_at DESC`,
      [user.id, stationKind],
    );
    return NextResponse.json({ stations: result.rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await rateLimitByKey("station-create", user.id, 20, 3_600);
    const data = stationSchema.parse(await parseJson(request));
    const stationKind = data.stationKind;
    const access = newAccessToken();
    const genreId = await activeGenreId(data.genreId);
    const station = await transaction(async (client) => {
      await lockActiveUser(client, user.id);
      const created = await client.query<{ id: string; station_kind: StationKind }>(
        `INSERT INTO stations
         (owner_id, name, description, station_kind, programming_mode, time_zone, mode, transition_ms, playback_order,
            genre_id, visibility, owner_declared_explicit, access_token_hash, access_token_ciphertext, access_token_hint, broadcast_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'SYNCHRONIZED', $7, $8, $9, $10, $11, $12, $13, $14, 'STOPPED')
         RETURNING id, station_kind`,
        [
          user.id,
          data.name,
          data.description,
          stationKind,
          stationKind === "RADIO" ? "CLOCK" : "LEGACY_LOOP",
          data.timeZone,
          data.transitionMs,
          data.playbackOrder,
          genreId,
          data.visibility,
          data.ownerDeclaredExplicit,
          access.hash,
          access.ciphertext,
          access.hint,
        ],
      );
      const station = created.rows[0];
      const strategy = station.station_kind === "RADIO" ? "WEEKLY_SCHEDULE" : "PLAYLIST_LOOP";
      const profile = await client.query<{ id: string }>(
        `INSERT INTO station_programming_profiles (station_id, name, strategy, lifecycle, config, created_by_user_id)
         VALUES ($1, $2, $3, 'ACTIVE', $4::jsonb, $5) RETURNING id`,
        [station.id, station.station_kind === "RADIO" ? "Weekly Schedule" : "Playlist Loop", strategy,
          JSON.stringify({ legacyProgrammingMode: station.station_kind === "RADIO" ? "CLOCK" : "LEGACY_LOOP" }), user.id],
      );
      await client.query("UPDATE stations SET active_programming_profile_id = $1 WHERE id = $2", [profile.rows[0].id, station.id]);
      return station;
    });
    if (station.station_kind === "RADIO") await query("INSERT INTO radio_visual_settings (station_id) VALUES ($1) ON CONFLICT DO NOTHING", [station.id]);
    return NextResponse.json({
      id: station.id,
      stationKind: station.station_kind,
      managementUrl: `/stations/${station.id}`,
      viewerUrl: viewerUrl(access.ciphertext, station.station_kind),
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
