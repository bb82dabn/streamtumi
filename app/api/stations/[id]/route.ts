import { NextResponse } from "next/server";
import { requireApiUser, assertStationOwner, makePasswordHash } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, jsonError, parseJson, HttpError } from "@/lib/http";
import { stationUpdateSchema } from "@/lib/validation";
import { stationForOwner, viewerUrl } from "@/lib/stations";
import { env } from "@/lib/env";
import { scheduleStationDeletion } from "@/lib/station-lifecycle";
import { activeGenreId, listGenres } from "@/lib/genres";
import { lockPublicationStation, publishAfterScheduleMutation, publishScheduleRefresh } from "@/lib/schedule-publication";
import type { PlaybackOrder } from "@/lib/schedule";
import { stationRoomAccessState } from "@/lib/station-rooms";
import { STATION_STORAGE_LIMIT_BYTES } from "@/lib/storage-quota";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const station = await stationForOwner(id, user.id);
    if (!station) throw new HttpError(404, "Station not found.", "NOT_FOUND");
    if (station.station_kind === "RADIO") throw new HttpError(409, "Use Radio station management for this station.", "RADIO_STATION");
    const [videos, playlist, genres, roomAccess] = await Promise.all([
      query(
        `SELECT id, title, description, status, source_file_name, mime_type, size_bytes::text,
                duration_ms::text, width, height, processing_progress, processing_attempts,
                processing_error, thumbnail_key IS NOT NULL AS has_thumbnail, created_at,
                source_kind, normalized_source_url, ingestion_status, ingestion_error
           FROM videos WHERE station_id = $1 AND status NOT IN ('ARCHIVED', 'REPLACED') ORDER BY created_at DESC`,
        [id],
      ),
      query(
        `SELECT p.id, p.video_id, p.position, p.page, p.story_slug, p.segment_type,
                p.planned_duration_ms::text, p.timing_mode, p.hard_start_offset_ms::text,
                p.editorial_status, p.technical_status, p.talent, p.camera_source_note,
                p.script, p.notes, v.title, v.duration_ms::text, v.status,
                v.thumbnail_key IS NOT NULL AS has_thumbnail
           FROM playlist_items p JOIN videos v ON v.id = p.video_id
          WHERE p.station_id = $1 ORDER BY p.position`,
        [id],
      ),
      listGenres(false),
      stationRoomAccessState(id, user.id),
    ]);
    return NextResponse.json({
      station: {
        ...station,
        mode: "SYNCHRONIZED",
        hasPassword: Boolean(station.access_password_hash),
        viewerUrl: viewerUrl(station.access_token_ciphertext, station.station_kind),
        access_password_hash: undefined,
        access_token_ciphertext: undefined,
        roomAccess,
      },
      videos: videos.rows,
      playlist: playlist.rows,
      genres,
      limits: {
        maxUploadBytes: env().MAX_UPLOAD_BYTES,
        maxStorageBytes: STATION_STORAGE_LIMIT_BYTES,
        youtubeImportEnabled: env().YOUTUBE_IMPORT_ENABLED,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwner(id, user.id);
    const data = stationUpdateSchema.parse(await parseJson(request));
    if (!Object.keys(data).length) throw new HttpError(400, "No station changes were supplied.", "NO_CHANGES");
    const nextGenreId = data.genreId === undefined ? undefined : await activeGenreId(data.genreId);
    const nextPasswordHash = data.accessPassword === undefined ? undefined : data.accessPassword ? await makePasswordHash(data.accessPassword) : null;
    const refresh = await transaction(async (client) => {
      const locked = await lockPublicationStation(client, id);
      const currentResult = await client.query<{
        name: string;
        description: string;
        transition_ms: number;
        playback_order: PlaybackOrder;
        auto_publish_next_loop: boolean;
        access_password_hash: string | null;
        visibility: "PRIVATE" | "PUBLIC";
        genre_id: string;
        owner_declared_explicit: boolean;
        access_enabled: boolean;
        access_expires_at: Date | null;
        has_room_key: boolean;
      }>(
        `SELECT name, description, transition_ms, playback_order, auto_publish_next_loop,
                access_password_hash, visibility, genre_id, owner_declared_explicit,
                 access_enabled, access_expires_at,
                 EXISTS (SELECT 1 FROM station_room_access room WHERE room.station_id = stations.id) AS has_room_key
           FROM stations WHERE id = $1`,
        [id],
      );
      const current = currentResult.rows[0];
      const nextVisibility = data.visibility ?? current.visibility;
      const nextHasPassword = data.accessPassword === undefined ? Boolean(current.access_password_hash) : Boolean(data.accessPassword);
      if (nextVisibility === "PUBLIC" && nextHasPassword) {
        throw new HttpError(409, "Remove the viewer password before making this station public.", "PUBLIC_PASSWORD_CONFLICT");
      }
      if (nextVisibility === "PUBLIC" && current.has_room_key) {
        throw new HttpError(409, "Disable the private room key before making this station public.", "PUBLIC_ROOM_KEY_CONFLICT");
      }
      if (current.has_room_key && data.accessPassword) {
        throw new HttpError(409, "Disable the private room key before setting a viewer password.", "ROOM_KEY_PASSWORD_CONFLICT");
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
      };
      if (data.name !== undefined && data.name !== current.name) add("name", data.name);
      if (data.description !== undefined && data.description !== current.description) add("description", data.description);
      const transitionChanged = data.transitionMs !== undefined && data.transitionMs !== current.transition_ms;
      const playbackOrderChanged = data.playbackOrder !== undefined && data.playbackOrder !== current.playback_order;
      const autoPublishEnabled = data.autoPublishNextLoop === true && !current.auto_publish_next_loop;
      if (transitionChanged) add("transition_ms", data.transitionMs);
      if (playbackOrderChanged) add("playback_order", data.playbackOrder);
      if (data.autoPublishNextLoop !== undefined && data.autoPublishNextLoop !== current.auto_publish_next_loop) add("auto_publish_next_loop", data.autoPublishNextLoop);
      if (nextGenreId !== undefined && nextGenreId !== current.genre_id) add("genre_id", nextGenreId);
      if (data.visibility !== undefined && data.visibility !== current.visibility) add("visibility", data.visibility);
      if (data.ownerDeclaredExplicit !== undefined && data.ownerDeclaredExplicit !== current.owner_declared_explicit) add("owner_declared_explicit", data.ownerDeclaredExplicit);
      if (data.accessEnabled !== undefined && data.accessEnabled !== current.access_enabled) add("access_enabled", data.accessEnabled);
      if (data.accessExpiresAt !== undefined) {
        const expiresAt = data.accessExpiresAt ? new Date(data.accessExpiresAt) : null;
        if (expiresAt?.getTime() !== current.access_expires_at?.getTime()) add("access_expires_at", expiresAt);
      }
      if (nextPasswordHash !== undefined) add("access_password_hash", nextPasswordHash);
      if (!fields.length) return locked.promoted;
      if (transitionChanged || playbackOrderChanged) fields.push("playlist_version = playlist_version + 1");
      values.push(id);
      await client.query(`UPDATE stations SET ${fields.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
      if (!transitionChanged && !playbackOrderChanged && !autoPublishEnabled) return locked.promoted;
      const publication = await publishAfterScheduleMutation(client, id);
      return locked.promoted || publication.activeChanged;
    });
    if (refresh) await publishScheduleRefresh(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const purgeAt = await scheduleStationDeletion(id, user.id);
    return NextResponse.json({ ok: true, purgeAt: purgeAt.toISOString() });
  } catch (error) {
    return jsonError(error);
  }
}
