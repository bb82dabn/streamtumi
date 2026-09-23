import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10).max(128);

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registerRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const emailVerificationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const emailVerificationRequestSchema = z.object({ token: emailVerificationTokenSchema });
export const emailVerificationResendRequestSchema = z.object({ email: emailSchema });
export const emailVerificationDeliverySchema = z.enum(["SENT", "FAILED"]);
export const emailVerificationStatusSchema = z.object({
  required: z.literal(true),
  delivery: emailVerificationDeliverySchema,
});
export const emailVerificationResponseSchema = z.object({
  ok: z.literal(true),
  verified: z.literal(true),
});
export const emailVerificationResendResponseSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});

export const mobileUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  displayName: z.string(),
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
  emailVerified: z.boolean(),
});

export const mobileAuthTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const mobileRefreshRequestSchema = z.object({ refreshToken: mobileAuthTokenSchema }).strict();
export const mobileLogoutRequestSchema = mobileRefreshRequestSchema;

export const authResponseSchema = z.object({
  token: mobileAuthTokenSchema,
  accessExpiresAt: z.string().datetime({ offset: true }),
  refreshToken: mobileAuthTokenSchema,
  refreshExpiresAt: z.string().datetime({ offset: true }),
  user: mobileUserSchema,
  verification: emailVerificationStatusSchema.optional(),
});

export const authMeResponseSchema = z.object({ user: mobileUserSchema });

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type EmailVerificationDelivery = z.infer<typeof emailVerificationDeliverySchema>;
export type MobileUser = z.infer<typeof mobileUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MobileRefreshRequest = z.infer<typeof mobileRefreshRequestSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
