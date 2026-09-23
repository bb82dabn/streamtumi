import { z } from "zod";
import { stationKinds, validTimeZone } from "@/lib/station-kind";
import { radioVisualizerIds } from "@/lib/radio-visualizers";

const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim());

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10).max(128);
export const titleSchema = clean(120).pipe(z.string().min(1));
export const descriptionSchema = clean(2000);

export const registerSchema = z.object({
  displayName: clean(80).pipe(z.string().min(1)),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
}).refine((value) => value.currentPassword !== value.newPassword, {
  path: ["newPassword"],
  message: "Choose a password different from your current password.",
});

export const stationSchema = z.object({
  name: titleSchema,
  description: descriptionSchema.default(""),
  stationKind: z.enum(stationKinds).default("TV"),
  timeZone: z.string().trim().min(1).max(100).refine(validTimeZone, "Choose a valid time zone.").default("UTC"),
  mode: z.literal("SYNCHRONIZED").optional(),
  transitionMs: z.number().int().min(0).max(10_000).default(0),
  playbackOrder: z.enum(["SEQUENTIAL", "SHUFFLE"]).default("SEQUENTIAL"),
  genreId: z.string().uuid().optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  ownerDeclaredExplicit: z.boolean().default(false),
});

export const stationUpdateSchema = z.object({
  name: titleSchema.optional(),
  description: descriptionSchema.optional(),
  mode: z.literal("SYNCHRONIZED").optional(),
  transitionMs: z.number().int().min(0).max(10_000).optional(),
  playbackOrder: z.enum(["SEQUENTIAL", "SHUFFLE"]).optional(),
  autoPublishNextLoop: z.boolean().optional(),
  genreId: z.string().uuid().optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  ownerDeclaredExplicit: z.boolean().optional(),
  accessEnabled: z.boolean().optional(),
  accessPassword: z.string().min(6).max(128).nullable().optional(),
  accessExpiresAt: z.string().datetime().nullable().optional(),
});

export const stationStartSchema = z.object({ strategy: z.enum(["restart", "resume"]) });

export const programmingStrategySchema = z.enum(["PLAYLIST_LOOP", "WEEKLY_SCHEDULE", "CALENDAR_EVENTS", "SMART_ROTATION"]);
export const programmingProfileCreateSchema = z.object({
  name: clean(120).pipe(z.string().min(1)),
  strategy: programmingStrategySchema,
});

export const stationRundownItemSchema = z.object({
  expectedPlaylistVersion: z.number().int().min(0),
  page: z.number().int().min(1).max(9999),
  storySlug: clean(160).pipe(z.string().min(1)),
  segmentType: z.enum(["STORY", "PACKAGE", "VO", "SOT", "LIVE", "BREAK", "BUMP", "GRAPHIC", "AUDIO", "COMMAND", "NOTE"]),
  plannedDurationMs: z.number().int().min(0).max(86_400_000).nullable(),
  timingMode: z.enum(["FOLLOW", "FLOAT", "HARD"]),
  hardStartOffsetMs: z.number().int().min(0).max(604_800_000).nullable(),
  editorialStatus: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "KILLED"]),
  technicalStatus: z.enum(["UNCHECKED", "READY", "WARNING", "BLOCKED"]),
  talent: clean(500),
  cameraSourceNote: clean(2000),
  script: z.string().trim().max(50_000),
  notes: z.string().trim().max(50_000),
}).superRefine((value, context) => {
  if (value.timingMode === "HARD" && value.hardStartOffsetMs === null) {
    context.addIssue({ code: "custom", path: ["hardStartOffsetMs"], message: "Hard starts require a start offset." });
  }
  if (value.timingMode !== "HARD" && value.hardStartOffsetMs !== null) {
    context.addIssue({ code: "custom", path: ["hardStartOffsetMs"], message: "Only hard starts may have a start offset." });
  }
});

export const stationRundownItemMutationSchema = z.object({
  expectedPlaylistVersion: z.number().int().min(0),
});

const reservedChatNames = new Set(["streamtumi", "host", "admin", "administrator", "moderator", "staff", "system"]);
export const chatUsernameSchema = z.string().trim().min(2).max(32)
  .transform((value) => value.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim())
  .refine((value) => value.length >= 2 && !reservedChatNames.has(value.toLowerCase()), "Choose a different username.");
export const chatIdentitySchema = z.object({ username: chatUsernameSchema });
export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(500)
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")),
});
export const chatHideSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const chatCursorSchema = z.object({ beforeAt: z.string().datetime(), beforeId: z.string().uuid() });

export const reportSchema = z.object({
  subjectType: z.enum(["STATION", "VIDEO", "CHAT_MESSAGE"]),
  videoId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  reason: z.enum(["ILLEGAL_CONTENT", "CHILD_SAFETY", "INTELLECTUAL_PROPERTY", "VIOLENCE_OR_THREATS", "HATE_OR_HARASSMENT", "SPAM_OR_SCAM", "OTHER"]),
  details: z.string().trim().min(10).max(2000),
  email: emailSchema.optional(),
}).refine((value) => value.subjectType !== "VIDEO" || Boolean(value.videoId), { message: "Choose a video to report." })
  .refine((value) => value.subjectType !== "CHAT_MESSAGE" || Boolean(value.messageId), { message: "Choose a chat message to report." });

export const moderationDecisionSchema = z.object({
  action: z.enum(["DISMISS", "HIDE_MESSAGE", "RESTRICT_STATION", "RESTORE_STATION", "ESCALATE"]),
  version: z.number().int().positive(),
  note: z.string().trim().min(3).max(2000),
  confidence: z.number().min(0).max(1).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const moderationTokenSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(["reports:read", "reports:decide"])).min(1),
});

export const expectedUserVersionSchema = z.number().int().positive();
export const adminUserProfileSchema = z.object({
  displayName: clean(80).pipe(z.string().min(1)),
  email: emailSchema,
  expectedVersion: expectedUserVersionSchema,
});
export const adminRoleUpdateSchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
  expectedVersion: expectedUserVersionSchema,
});
export const adminUserStatusSchema = z.object({
  disabled: z.boolean(),
  reason: clean(500).optional(),
  expectedVersion: expectedUserVersionSchema,
}).superRefine((value, context) => {
  if (value.disabled && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required when disabling an account." });
  }
});
export const adminTemporaryPasswordSchema = z.object({
  password: passwordSchema,
  expectedVersion: expectedUserVersionSchema,
});
export const adminUserDeleteSchema = z.object({
  confirmation: z.string().max(254),
  expectedVersion: expectedUserVersionSchema,
});
export const adminPreviewOpenSchema = z.object({
  reason: clean(500).pipe(z.string().min(10)),
});
export const adminGenreCreateSchema = z.object({
  name: clean(60).pipe(z.string().min(2)),
  description: clean(240).default(""),
  isExplicit: z.boolean().default(false),
});
export const adminGenreUpdateSchema = adminGenreCreateSchema.partial().extend({ active: z.boolean().optional() });
export const stationRatingSchema = z.object({ rating: z.number().int().min(1).max(5) });
export const contentPreferenceSchema = z.object({
  showExplicitContent: z.boolean(),
  confirmAdult: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.showExplicitContent && value.confirmAdult !== true) {
    context.addIssue({ code: "custom", path: ["confirmAdult"], message: "Adult confirmation is required." });
  }
});
export const explicitEnforcementSchema = z.object({
  enforced: z.boolean(),
  note: clean(1000).pipe(z.string().min(3)),
});
export const guideQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  type: z.enum(["all", "tv", "radio"]).default("all"),
  genre: z.string().uuid().optional(),
  sort: z.enum(["viewers", "rating", "fans", "chat", "newest", "name", "genre"]).default("viewers"),
  onAir: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const legalHoldSchema = z.object({ active: z.boolean(), note: z.string().trim().min(3).max(1000) });

export const videoUpdateSchema = z.object({ title: titleSchema.optional(), description: descriptionSchema.optional() });

export const initiateUploadSchema = z.object({
  filename: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  replacementForId: z.string().uuid().optional(),
});

export const radioTrackInitiateSchema = z.object({
  filename: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  uploadRequestId: z.string().uuid(),
  rightsConfirmed: z.literal(true),
});

export const radioTrackUpdateSchema = z.object({
  title: titleSchema.optional(),
  artist: clean(120).optional(),
  album: clean(120).optional(),
}).refine((value) => Object.keys(value).length > 0, "Supply at least one metadata change.");

export const clockDraftVersionSchema = z.number().int().min(0);
export const radioRotationCreateSchema = z.object({
  name: clean(80).pipe(z.string().min(1)),
  purpose: z.enum(["CONTENT", "JINGLE", "FALLBACK"]).default("CONTENT"),
  expectedDraftVersion: clockDraftVersionSchema,
});
export const radioRotationUpdateSchema = z.object({
  name: clean(80).pipe(z.string().min(1)),
  purpose: z.enum(["CONTENT", "JINGLE", "FALLBACK"]),
  expectedDraftVersion: clockDraftVersionSchema,
});
export const radioRotationItemsSchema = z.object({
  trackIds: z.array(z.string().uuid()).min(1).max(1000),
  expectedDraftVersion: clockDraftVersionSchema,
});
export const weeklyClockDraftSchema = z.object({
  timeZone: z.string().trim().min(1).max(100).refine(validTimeZone, "Choose a valid time zone."),
  expectedDraftVersion: clockDraftVersionSchema,
  blocks: z.array(z.object({
    startMinute: z.number().int().min(0).max(10_079),
    rotationId: z.string().uuid(),
    page: z.number().int().min(1).max(9999).optional(),
    storySlug: clean(160).pipe(z.string().min(1)).optional(),
    segmentType: z.enum(["STORY", "PACKAGE", "VO", "SOT", "LIVE", "BREAK", "BUMP", "GRAPHIC", "AUDIO", "COMMAND", "NOTE"]).default("AUDIO"),
    plannedDurationMs: z.number().int().min(0).max(604_800_000).nullable().default(null),
    editorialStatus: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "KILLED"]).default("DRAFT"),
    technicalStatus: z.enum(["UNCHECKED", "READY", "WARNING", "BLOCKED"]).default("UNCHECKED"),
    talent: clean(500).default(""),
    cameraSourceNote: clean(2000).default(""),
    script: z.string().trim().max(50_000).default(""),
    notes: z.string().trim().max(50_000).default(""),
  })).min(1).max(336),
}).superRefine((value, context) => {
  const starts = new Set<number>();
  for (const [index, block] of value.blocks.entries()) {
    if (starts.has(block.startMinute)) context.addIssue({ code: "custom", path: ["blocks", index, "startMinute"], message: "Clock blocks cannot share a start time." });
    starts.add(block.startMinute);
  }
});
export const clockPublishSchema = z.object({ expectedDraftVersion: clockDraftVersionSchema });
export const radioVisualSettingsSchema = z.object({
  mode: z.enum(["COVER", "VISUALIZER"]),
  visualizerId: z.enum(radioVisualizerIds),
  expectedVersion: z.number().int().positive(),
});

export const youtubeImportSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  rightsConfirmed: z.literal(true),
  requestId: z.string().uuid(),
});

export const failUploadSchema = z.object({ error: z.string().trim().max(500).optional() });

const acceptedMimeTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
  "video/mpeg",
]);

const acceptedExtensions = new Set(["mp4", "mov", "mkv", "webm", "avi", "mpeg", "mpg", "m4v"]);

export function validateUpload(filename: string, mimeType: string, size: number, maxSize: number): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!filename || filename.length > 255) return "The file name is invalid.";
  if (!acceptedMimeTypes.has(mimeType.toLowerCase()) || !acceptedExtensions.has(extension)) {
    return "Supported video types are MP4, MOV, MKV, WebM, AVI, and MPEG.";
  }
  if (!Number.isSafeInteger(size) || size <= 0) return "The video file is empty.";
  if (size > maxSize) return `The video exceeds the ${Math.floor(maxSize / 1024 / 1024)} MB upload limit.`;
  return null;
}

export const detectedVideoMimes = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo", "video/mpeg"]);

const acceptedAudioMimeTypes = new Set([
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/x-aac",
  "audio/wav", "audio/x-wav", "audio/vnd.wave", "audio/flac", "audio/x-flac",
]);
const acceptedAudioExtensions = new Set(["mp3", "m4a", "aac", "wav", "flac"]);

export function validateAudioUpload(filename: string, mimeType: string, size: number, maxSize: number): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!filename || filename.length > 255) return "The file name is invalid.";
  if (!acceptedAudioMimeTypes.has(mimeType.toLowerCase()) || !acceptedAudioExtensions.has(extension)) {
    return "Supported audio types are MP3, M4A/AAC, WAV, and FLAC.";
  }
  if (!Number.isSafeInteger(size) || size <= 0) return "The audio file is empty.";
  if (size > maxSize) return `The audio file exceeds the ${Math.floor(maxSize / 1024 / 1024)} MB upload limit.`;
  return null;
}

export const detectedAudioMimes = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac"]);
