import { z } from "zod";

const relativeOrAbsoluteUrlSchema = z.string().min(1);

const stationMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  timeZone: z.string(),
  mode: z.literal("SYNCHRONIZED"),
  hasLogo: z.boolean(),
  hasOfflineSlate: z.boolean(),
  broadcastState: z.enum(["RUNNING", "STOPPED"]),
  explicit: z.boolean(),
  playbackKind: z.enum(["SCHEDULED_TV", "CONTINUOUS_RADIO", "PERSONALIZED_WEATHER"]).optional(),
});

export const publicCalendarRuntimeSchema = z.object({
  occurrenceRef: z.string().regex(/^cal_[A-Za-z0-9_-]{24}$/).nullable(),
  planned: z.object({
    title: z.string(),
    kind: z.enum(["PROGRAM", "PREMIERE", "OFFLINE"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable(),
  }).nullable(),
  desiredSourceRole: z.enum(["BASELINE", "PRIMARY", "FALLBACK"]).nullable(),
  actual: z.object({
    status: z.enum(["PLAYING", "LIVE", "FALLBACK"]),
    sourceRole: z.enum(["BASELINE", "PRIMARY", "FALLBACK"]),
    freshAt: z.string().datetime(),
  }).nullable(),
  fallbackStatus: z.enum(["NONE", "READY", "ACTIVE"]),
  nextBoundaryAt: z.string().datetime().nullable(),
});

export const tvPlaylistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  durationMs: z.number().int().positive(),
  schedulePosition: z.number().int().nonnegative(),
  hlsUrl: relativeOrAbsoluteUrlSchema,
  thumbnailUrl: relativeOrAbsoluteUrlSchema.nullable(),
  captionsUrl: relativeOrAbsoluteUrlSchema.nullable(),
});

const tvDeliverySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("LEGACY_VOD") }),
  z.object({
    mode: z.literal("CHANNEL_HLS"),
    status: z.enum(["AVAILABLE", "STARTING", "FAILED", "STOPPED"]),
    version: z.string().min(1),
    renditionMode: z.enum(["DUAL", "HD_ONLY"]),
    hlsUrl: relativeOrAbsoluteUrlSchema.optional(),
  }),
]);

export const tvProgramSchema = z.object({
  kind: z.literal("TV_AUTOMATION"),
  itemId: z.string(),
  title: z.string(),
});

export const tvStationResponseSchema = z.object({
  station: stationMetadataSchema.extend({
    stationKind: z.literal("TV"),
    transitionMs: z.number().int().nonnegative().optional(),
    playbackOrder: z.enum(["SEQUENTIAL", "SHUFFLE"]).optional(),
  }),
  online: z.boolean(),
  serverTime: z.string().datetime(),
  scheduleId: z.string().optional(),
  scheduleStartedAt: z.string().datetime().optional(),
  playbackOrder: z.enum(["SEQUENTIAL", "SHUFFLE"]).optional(),
  shuffleSeed: z.string().optional(),
  delivery: tvDeliverySchema.optional(),
  program: tvProgramSchema.optional(),
  calendarRuntime: publicCalendarRuntimeSchema.optional(),
  playlist: z.array(tvPlaylistItemSchema),
  position: z.object({
    index: z.number().int().nonnegative(),
    itemId: z.string(),
    playbackOffsetMs: z.number().nonnegative(),
    cycleOffsetMs: z.number().nonnegative().optional(),
    cycleNumber: z.number().int().optional(),
    inTransition: z.boolean().optional(),
    transitionRemainingMs: z.number().nonnegative().optional(),
  }).optional(),
});

const radioPlaybackSchema = z.object({
  kind: z.literal("RADIO_CLOCK"),
  status: z.enum(["SETUP", "STOPPED", "STARTING", "UNAVAILABLE", "ON_AIR"]),
  timelineItemId: z.string().optional(),
  title: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  album: z.string().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  playbackOffsetMs: z.number().nonnegative().optional(),
  artworkAvailable: z.boolean().optional(),
  artworkUrl: relativeOrAbsoluteUrlSchema.optional(),
  blockName: z.string().nullable().optional(),
  playlistName: z.string().nullable().optional(),
  effectiveAt: z.string().datetime().nullable().optional(),
});

export const radioStationResponseSchema = z.object({
  station: stationMetadataSchema.extend({ stationKind: z.literal("RADIO") }),
  online: z.boolean(),
  serverTime: z.string().datetime(),
  releaseId: z.string().optional(),
  visual: z.object({
    mode: z.enum(["COVER", "VISUALIZER"]),
    visualizerId: z.string(),
  }).optional(),
  stream: z.object({
    status: z.enum(["AVAILABLE", "STARTING", "FAILED", "STOPPED"]),
    sessionId: z.string().optional(),
    audioHlsUrl: relativeOrAbsoluteUrlSchema.optional(),
    waveformHlsUrl: relativeOrAbsoluteUrlSchema.optional(),
    visualHlsUrl: relativeOrAbsoluteUrlSchema.optional(),
  }).optional(),
  playback: radioPlaybackSchema,
  calendarRuntime: publicCalendarRuntimeSchema.optional(),
  next: z.object({
    title: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    album: z.string().nullable().optional(),
    startsAt: z.string().datetime().optional(),
    scheduledStart: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const stationResponseSchema = z.union([
  tvStationResponseSchema,
  radioStationResponseSchema,
]);

export type TvPlaylistItem = z.infer<typeof tvPlaylistItemSchema>;
export type PublicCalendarRuntime = z.infer<typeof publicCalendarRuntimeSchema>;
export type TvProgram = z.infer<typeof tvProgramSchema>;
export type TvStationResponse = z.infer<typeof tvStationResponseSchema>;
export type RadioStationResponse = z.infer<typeof radioStationResponseSchema>;
export type StationResponse = z.infer<typeof stationResponseSchema>;
