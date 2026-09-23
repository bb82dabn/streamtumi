import { z } from "zod";

export const roomAccessKeySchema = z.string().trim().regex(/^\d{6}$/);
export const roomSessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const roomAccessRequestSchema = z.object({
  accessKey: roomAccessKeySchema,
}).strict();

export const roomSessionRequestSchema = z.object({
  roomSessionToken: roomSessionTokenSchema,
}).strict();

export const roomPlaybackStationSchema = z.object({
  id: z.string().uuid(),
  stationKind: z.enum(["TV", "RADIO"]),
  playbackKind: z.enum(["SCHEDULED_TV", "CONTINUOUS_RADIO"]),
  name: z.string(),
  description: z.string(),
  ownerName: z.string(),
  genreName: z.string(),
  online: z.boolean(),
  explicit: z.boolean(),
  artworkUrl: z.string().url().nullable(),
  slateUrl: z.string().url().nullable(),
  stationUrl: z.string().url(),
  chatUrl: z.string().url(),
  grantExpiresAt: z.string().datetime({ offset: true }),
});

export const roomPlaybackResponseSchema = z.object({
  station: roomPlaybackStationSchema,
  roomSessionToken: roomSessionTokenSchema.nullable(),
  membershipSaved: z.boolean(),
});

export const deviceRoomCatalogStationSchema = roomPlaybackStationSchema.omit({
  stationUrl: true,
  chatUrl: true,
  grantExpiresAt: true,
}).extend({
  accessUrl: z.string().url(),
  relationship: z.enum(["OWNER", "MEMBER"]),
});

export type RoomPlaybackResponse = z.infer<typeof roomPlaybackResponseSchema>;
export type DeviceRoomCatalogStation = z.infer<typeof deviceRoomCatalogStationSchema>;
