import { z } from "zod";

export const mobileStationResolveSchema = z.object({
  apiVersion: z.literal(1),
  stationUrl: z.string().url(),
  stationKind: z.enum(["TV", "RADIO"]),
  playbackKind: z.enum(["SCHEDULED_TV", "CONTINUOUS_RADIO", "PERSONALIZED_WEATHER"]),
  name: z.string(),
  description: z.string(),
  timeZone: z.string(),
  explicit: z.boolean(),
  requiresPassword: z.boolean(),
  requiresAccessKey: z.boolean(),
  broadcastState: z.enum(["RUNNING", "STOPPED"]),
  hasLogo: z.boolean(),
  hasOfflineSlate: z.boolean(),
});

export const personalizedWeatherPlaybackSchema = z.object({
  kind: z.literal("PERSONALIZED_HLS"),
  provider: z.literal("WS4KP"),
  sessionId: z.string().uuid(),
  hlsUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
  displayMode: z.literal("WIDESCREEN_16_9"),
});

export const mobileStationAccessSchema = z.object({
  grant: z.string().regex(/^\d{1,10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
  expiresAt: z.string().datetime(),
});

export type MobileStationResolve = z.infer<typeof mobileStationResolveSchema>;
export type MobileStationAccess = z.infer<typeof mobileStationAccessSchema>;
export type PersonalizedWeatherPlayback = z.infer<typeof personalizedWeatherPlaybackSchema>;
