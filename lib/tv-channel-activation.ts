import { transaction } from "@/lib/db";
import { publishEditableSchedule } from "@/lib/schedule-publication";

export type TvChannelRenditionMode = "DUAL" | "HD_ONLY";

export type TvChannelActivationArguments = {
  stationId: string;
  disable: boolean;
  renditionMode?: TvChannelRenditionMode;
};

const stationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usage = "Usage: npm run tv:activate-channel -- <station-uuid> [--disable | --rendition-mode DUAL|HD_ONLY]";

export function parseTvChannelActivationArguments(argv: string[]): TvChannelActivationArguments {
  let stationId: string | undefined;
  let disable = false;
  let renditionMode: TvChannelRenditionMode | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--disable") {
      if (disable) throw new Error(usage);
      disable = true;
      continue;
    }
    if (value === "--rendition-mode") {
      const mode = argv[index + 1];
      if (renditionMode || (mode !== "DUAL" && mode !== "HD_ONLY")) throw new Error(usage);
      renditionMode = mode;
      index += 1;
      continue;
    }
    if (value.startsWith("--") || stationId) throw new Error(usage);
    stationId = value;
  }
  if (!stationId || !stationIdPattern.test(stationId) || (disable && renditionMode)) throw new Error(usage);
  return { stationId, disable, ...(renditionMode ? { renditionMode } : {}) };
}

export type TvChannelActivationResult = {
  name: string;
  disabled: boolean;
  renditionMode: TvChannelRenditionMode;
  modeChanged: boolean;
  scheduleId?: string;
};

export async function setTvChannelActivation(input: TvChannelActivationArguments): Promise<TvChannelActivationResult> {
  return transaction(async (client) => {
    const stationResult = await client.query<{
      name: string;
      visibility: "PRIVATE" | "PUBLIC";
      tv_delivery_mode: "LEGACY_VOD" | "CHANNEL_HLS";
      tv_channel_rendition_mode: TvChannelRenditionMode;
      has_ready_playlist: boolean;
    }>(
      `SELECT name, visibility, tv_delivery_mode, tv_channel_rendition_mode,
              EXISTS (
                SELECT 1 FROM playlist_items item
                JOIN videos video ON video.id = item.video_id
                WHERE item.station_id = stations.id AND video.status = 'READY'
                  AND video.duration_ms > 0 AND video.hls_key IS NOT NULL
              ) AS has_ready_playlist
         FROM stations
        WHERE id = $1 AND station_kind = 'TV' AND deleted_at IS NULL
        FOR UPDATE`,
      [input.stationId],
    );
    const station = stationResult.rows[0];
    if (!station) throw new Error("TV station not found.");

    if (input.disable) {
      if (station.tv_delivery_mode !== "CHANNEL_HLS") throw new Error("Enabled TV channel station not found.");
      await client.query(
        `UPDATE stations SET tv_delivery_mode = 'LEGACY_VOD', updated_at = now()
          WHERE id = $1`,
        [input.stationId],
      );
      return {
        name: station.name,
        disabled: true,
        renditionMode: station.tv_channel_rendition_mode,
        modeChanged: false,
      };
    }

    if (station.visibility !== "PRIVATE") throw new Error("Initial CHANNEL_HLS activation is restricted to private stations.");
    const renditionMode = input.renditionMode ?? station.tv_channel_rendition_mode;
    const modeChanged = renditionMode !== station.tv_channel_rendition_mode;

    await client.query(
      `UPDATE stations
          SET tv_delivery_mode = 'CHANNEL_HLS', tv_channel_rendition_mode = $2, updated_at = now()
        WHERE id = $1`,
      [input.stationId, renditionMode],
    );
    if (modeChanged && station.tv_delivery_mode === "CHANNEL_HLS") {
      await client.query(
        `UPDATE tv_playout_leases
            SET fence = fence + 1, updated_at = clock_timestamp()
          WHERE station_id = $1`,
        [input.stationId],
      );
    }
    if (!station.has_ready_playlist) {
      return {
        name: station.name,
        disabled: false,
        renditionMode,
        modeChanged,
      };
    }
    const publication = await publishEditableSchedule(client, input.stationId, "immediate");
    return {
      name: station.name,
      disabled: false,
      renditionMode,
      modeChanged,
      scheduleId: publication.scheduleId,
    };
  });
}
