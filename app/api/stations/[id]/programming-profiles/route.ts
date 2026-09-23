import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { programmingProfileCreateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };
type Strategy = "PLAYLIST_LOOP" | "WEEKLY_SCHEDULE" | "CALENDAR_EVENTS" | "SMART_ROTATION";

const labels: Record<Strategy, string> = {
  PLAYLIST_LOOP: "Playlist Loop",
  WEEKLY_SCHEDULE: "Weekly Schedule",
  CALENDAR_EVENTS: "Calendar Events",
  SMART_ROTATION: "Smart Rotation",
};

async function ownedStation(id: string, ownerId: string) {
  const result = await query<{ id: string; station_kind: "TV" | "RADIO"; active_programming_profile_id: string; programming_mode: "LEGACY_LOOP" | "CLOCK"; active_schedule_id: string | null; active_clock_release_id: string | null }>(
    `SELECT id, station_kind, active_programming_profile_id, programming_mode,
            active_schedule_id, active_clock_release_id
       FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [id, ownerId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
  return result.rows[0];
}

async function migrationPreview(stationId: string, kind: "TV" | "RADIO", strategy: Strategy) {
  const [media, programming] = await Promise.all([
    query<{ count: string }>(kind === "TV"
      ? "SELECT count(*)::text FROM videos WHERE station_id = $1 AND status = 'READY'"
      : "SELECT count(*)::text FROM radio_tracks WHERE station_id = $1 AND status = 'READY'", [stationId]),
    query<{ count: string }>(kind === "TV"
      ? "SELECT count(*)::text FROM playlist_items WHERE station_id = $1"
      : "SELECT count(*)::text FROM clock_draft_blocks WHERE station_id = $1", [stationId]),
  ]);
  const warnings: string[] = [];
  if (strategy === "WEEKLY_SCHEDULE" && kind === "TV") warnings.push("The video weekly-schedule compiler is required before this profile can be activated.");
  if (strategy === "PLAYLIST_LOOP" && kind === "RADIO") warnings.push("The audio playlist-loop compiler is required before this profile can be activated.");
  if (strategy === "CALENDAR_EVENTS") warnings.push("Calendar event compilation is not available yet.");
  if (strategy === "SMART_ROTATION") warnings.push("Smart rotation rules are not available yet.");
  return {
    targetLabel: labels[strategy],
    preservedMediaCount: Number(media.rows[0]?.count ?? 0),
    existingProgrammingRows: Number(programming.rows[0]?.count ?? 0),
    activatable: warnings.length === 0 && ((kind === "TV" && strategy === "PLAYLIST_LOOP") || (kind === "RADIO" && strategy === "WEEKLY_SCHEDULE")),
    warnings,
  };
}

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const station = await ownedStation(id, user.id);
    const profiles = await query<{ id: string; name: string; strategy: Strategy; lifecycle: "DRAFT" | "ACTIVE" | "ARCHIVED"; migration_preview: unknown; version: number; created_at: Date; updated_at: Date }>(
      `SELECT id, name, strategy, lifecycle, migration_preview, version, created_at, updated_at
         FROM station_programming_profiles WHERE station_id = $1
        ORDER BY CASE lifecycle WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, updated_at DESC`,
      [id],
    );
    return NextResponse.json({
      stationKind: station.station_kind,
      activeProfileId: station.active_programming_profile_id,
      deliveryManagement: "AUTOMATIC",
      profiles: profiles.rows.map((profile) => ({ ...profile, migrationPreview: profile.migration_preview, migration_preview: undefined })),
      strategies: (Object.keys(labels) as Strategy[]).map((strategy) => ({ id: strategy, label: labels[strategy] })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const station = await ownedStation(id, user.id);
    const data = programmingProfileCreateSchema.parse(await parseJson(request));
    const preview = await migrationPreview(id, station.station_kind, data.strategy);
    const profile = await transaction(async (client) => {
      const current = await client.query<{ active_programming_profile_id: string }>("SELECT active_programming_profile_id FROM stations WHERE id = $1 AND owner_id = $2 FOR UPDATE", [id, user.id]);
      if (!current.rows[0]) throw new HttpError(404, "Station not found.", "NOT_FOUND");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO station_programming_profiles
           (station_id, name, strategy, lifecycle, source_profile_id, migration_preview, created_by_user_id)
         VALUES ($1, $2, $3, 'DRAFT', $4, $5::jsonb, $6)
         RETURNING id`,
        [id, data.name, data.strategy, current.rows[0].active_programming_profile_id, JSON.stringify(preview), user.id],
      );
      return inserted.rows[0];
    });
    return NextResponse.json({ id: profile.id, strategy: data.strategy, migrationPreview: preview }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
