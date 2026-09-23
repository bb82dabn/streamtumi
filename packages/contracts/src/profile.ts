import { z } from "zod";

const forbiddenDisplayNameCharacters = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const reservedAuthorityNames = new Set([
  "admin",
  "administrator",
  "host",
  "moderator",
  "official",
  "staff",
  "streamtumi",
  "streamtumiadmin",
  "streamtumimoderator",
  "streamtumistaff",
  "streamtumisupport",
  "support",
  "system",
]);

function authorityKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[\s._-]+/gu, "");
}

export const profileDisplayNameSchema = z.string().max(128)
  .refine((value) => !forbiddenDisplayNameCharacters.test(value), "Display names cannot contain control or bidirectional formatting characters.")
  .transform((value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim())
  .refine((value) => Array.from(value).length >= 2 && Array.from(value).length <= 32, "Display names must contain 2 to 32 characters.")
  .refine((value) => !reservedAuthorityNames.has(authorityKey(value)), "Choose a display name that does not imply platform authority.");

export const communityProfileSchema = z.object({
  displayName: profileDisplayNameSchema,
  avatarUrl: z.string().min(1).nullable(),
  version: z.number().int().positive(),
});

export const communityProfileResponseSchema = z.object({ profile: communityProfileSchema });

export const updateCommunityProfileRequestSchema = z.object({
  displayName: profileDisplayNameSchema,
  expectedVersion: z.number().int().positive(),
});

export type CommunityProfile = z.infer<typeof communityProfileSchema>;
export type CommunityProfileResponse = z.infer<typeof communityProfileResponseSchema>;
export type UpdateCommunityProfileRequest = z.infer<typeof updateCommunityProfileRequestSchema>;
