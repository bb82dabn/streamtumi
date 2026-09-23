import { z } from "zod";

export const communityReportReasons = [
  "ILLEGAL_CONTENT",
  "CHILD_SAFETY",
  "INTELLECTUAL_PROPERTY",
  "VIOLENCE_OR_THREATS",
  "HATE_OR_HARASSMENT",
  "SPAM_OR_SCAM",
  "OTHER",
] as const;

export const communityReportReasonSchema = z.enum(communityReportReasons);
export const communityReportRequestSchema = z.object({
  subjectType: z.enum(["STATION", "VIDEO", "CHAT_MESSAGE"]),
  videoId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  reason: communityReportReasonSchema,
  details: z.string().trim().min(10).max(2000),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
}).strict()
  .refine((value) => value.subjectType !== "VIDEO" || Boolean(value.videoId), { message: "Choose a video to report." })
  .refine((value) => value.subjectType !== "CHAT_MESSAGE" || Boolean(value.messageId), { message: "Choose a chat message to report." });

export const communityReportResponseSchema = z.object({
  ok: z.literal(true),
  reference: z.string().regex(/^ST-[0-9A-F]{10}$/),
}).strict();

export const communityBlockSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["REGISTERED", "GUEST"]),
  snapshotDisplayName: z.string().min(1).max(80),
  blockedAt: z.string().datetime({ offset: true }),
}).strict();
export const communityBlockResponseSchema = z.object({
  ok: z.literal(true),
  block: communityBlockSchema,
}).strict();
export const communityBlocksResponseSchema = z.object({
  blocks: z.array(communityBlockSchema),
}).strict();
export const communityUnblockResponseSchema = z.object({
  ok: z.literal(true),
  removed: z.boolean(),
}).strict();

export type CommunityReportReason = z.infer<typeof communityReportReasonSchema>;
export type CommunityReportRequest = z.infer<typeof communityReportRequestSchema>;
export type CommunityBlock = z.infer<typeof communityBlockSchema>;
