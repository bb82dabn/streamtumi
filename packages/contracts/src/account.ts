import { z } from "zod";
import { authResponseSchema, emailSchema, mobileAuthTokenSchema, passwordSchema } from "./auth";

export const passwordResetRequestSchema = z.object({ email: emailSchema }).strict();
export const passwordResetTokenSchema = mobileAuthTokenSchema;
export const passwordResetSchema = z.object({
  token: passwordResetTokenSchema,
  newPassword: passwordSchema,
}).strict();
export const passwordResetRequestResponseSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});
export const passwordResetResponseSchema = z.object({
  ok: z.literal(true),
  loginRequired: z.literal(true),
});

export const mobilePasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  path: ["newPassword"],
  message: "Choose a password different from your current password.",
});
export const mobilePasswordChangeResponseSchema = authResponseSchema;

export const adultContentPreferenceRequestSchema = z.object({
  showExplicitContent: z.boolean(),
  confirmAdult: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.showExplicitContent && value.confirmAdult !== true) {
    context.addIssue({ code: "custom", path: ["confirmAdult"], message: "Confirm that you are at least 18 years old." });
  }
});
export const adultContentPreferenceResponseSchema = z.object({
  showExplicitContent: z.boolean(),
  explicitAgeAttestedAt: z.string().datetime({ offset: true }).nullable(),
});

export const weatherZipCodeSchema = z.string().regex(/^[0-9]{5}$/, "Enter a five-digit ZIP code.");
export const weatherLocationUpdateRequestSchema = z.object({
  weatherZipCode: weatherZipCodeSchema.nullable(),
}).strict();
export const weatherLocationResponseSchema = z.object({
  weatherZipCode: weatherZipCodeSchema.nullable(),
});

export const mobileAccountSettingsSchema = z.object({
  email: emailSchema,
  showExplicitContent: z.boolean(),
  explicitAgeAttestedAt: z.string().datetime({ offset: true }).nullable(),
  weatherZipCode: weatherZipCodeSchema.nullable(),
});
export const mobileAccountSettingsResponseSchema = z.object({ account: mobileAccountSettingsSchema });

export const tuneHistoryClearResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.number().int().nonnegative(),
  retentionDays: z.literal(90),
});

export const accountDeletionRequestSchema = z.object({
  confirmationEmail: emailSchema,
  currentPassword: z.string().min(1).max(128),
}).strict();
export const accountDeletionResponseSchema = z.object({
  ok: z.literal(true),
  deletionRequested: z.literal(true),
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
export type MobilePasswordChangeRequest = z.infer<typeof mobilePasswordChangeRequestSchema>;
export type AdultContentPreferenceRequest = z.infer<typeof adultContentPreferenceRequestSchema>;
export type WeatherLocationUpdateRequest = z.infer<typeof weatherLocationUpdateRequestSchema>;
export type WeatherLocation = z.infer<typeof weatherLocationResponseSchema>;
export type MobileAccountSettings = z.infer<typeof mobileAccountSettingsSchema>;
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;
export type AccountDeletionResponse = z.infer<typeof accountDeletionResponseSchema>;
