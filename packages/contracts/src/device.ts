import { z } from "zod";
import { personalizedWeatherPlaybackSchema } from "./playback";

export const deviceTypeSchema = z.enum(["ROKU", "TV"]);
export const deviceScopeSchema = z.enum(["catalog:read", "tunes:write", "rooms:join"]);
export const deviceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const deviceUserCodeSchema = z.string().trim().regex(/^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i);

export const deviceAuthorizationStartRequestSchema = z.object({
  deviceType: deviceTypeSchema,
  displayName: z.string().trim().min(1).max(80),
}).strict();
export const deviceAuthorizationStartResponseSchema = z.object({
  deviceCode: deviceTokenSchema,
  userCode: z.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/),
  verificationUri: z.string().url(),
  verificationUriComplete: z.string().url(),
  expiresIn: z.literal(600),
  interval: z.literal(5),
});

export const deviceTokenRequestSchema = z.object({ deviceCode: deviceTokenSchema }).strict();
export const deviceTokenResponseSchema = z.object({
  deviceToken: deviceTokenSchema,
  tokenType: z.literal("Device"),
  expiresAt: z.string().datetime({ offset: true }),
  scopes: z.array(deviceScopeSchema),
});

export const deviceLoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  deviceType: deviceTypeSchema,
  displayName: z.string().trim().min(1).max(80),
}).strict();

export const deviceLoginResponseSchema = deviceTokenResponseSchema.extend({
  account: z.object({
    displayName: z.string(),
    email: z.string().email(),
  }),
});
export const deviceAuthorizationErrorSchema = z.object({
  error: z.enum(["authorization_pending", "slow_down", "expired_token"]),
  interval: z.number().int().min(5).optional(),
});

export const deviceActivationRequestSchema = z.object({ userCode: deviceUserCodeSchema }).strict();
export const deviceActivationResponseSchema = z.object({
  ok: z.literal(true),
  device: z.object({
    deviceType: deviceTypeSchema,
    displayName: z.string(),
  }),
});

export const linkedDeviceSchema = z.object({
  id: z.string().uuid(),
  deviceType: deviceTypeSchema,
  displayName: z.string(),
  scopes: z.array(deviceScopeSchema),
  createdAt: z.string().datetime({ offset: true }),
  lastUsedAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
});
export const linkedDevicesResponseSchema = z.object({ devices: z.array(linkedDeviceSchema) });
export const deviceRevocationResponseSchema = z.object({
  ok: z.literal(true),
  revoked: z.boolean(),
});

export const deviceTuneRequestSchema = z.object({
  id: z.string().uuid(),
  stationToken: deviceTokenSchema,
}).strict();
export const deviceTuneResponseSchema = z.object({
  tune: z.object({
    id: z.string().uuid(),
    stationId: z.string().uuid(),
    client: deviceTypeSchema,
    tunedAt: z.string().datetime({ offset: true }),
  }),
  playback: personalizedWeatherPlaybackSchema.optional(),
});

export type DeviceType = z.infer<typeof deviceTypeSchema>;
export type DeviceScope = z.infer<typeof deviceScopeSchema>;
export type DeviceAuthorizationStartRequest = z.infer<typeof deviceAuthorizationStartRequestSchema>;
export type DeviceTokenResponse = z.infer<typeof deviceTokenResponseSchema>;
export type LinkedDevice = z.infer<typeof linkedDeviceSchema>;
