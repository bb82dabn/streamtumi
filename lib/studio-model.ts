import { z } from "zod";
import type { StationKind } from "@/lib/station-kind";

const identifierSchema = z.string().uuid();
const tickSchema = z.string().max(30).regex(/^\d+$/, "Timeline positions must use non-negative integer ticks.");
const durationTickSchema = z.string().max(30).regex(/^[1-9]\d*$/, "Timeline durations must use positive integer ticks.");
const parameterSchema = z.record(z.string().min(1).max(80), z.number().finite()).refine(
  (parameters) => Object.keys(parameters).length <= 64,
  "Effects may define at most 64 parameters.",
);
const maxDocumentClips = 10_000;
const maxDocumentEffects = 4_096;
const maxDocumentEffectParameters = 16_384;

export const studioEffectTypes = [
  "PARAMETRIC_EQ",
  "GATE",
  "COMPRESSOR",
  "DEESSER",
  "LIMITER",
  "REVERB",
  "DELAY",
  "FILTER",
  "TRANSFORM",
  "COLOR",
  "CHROMA_KEY",
] as const;

export const studioEffectSchema = z.object({
  id: identifierSchema,
  type: z.enum(studioEffectTypes),
  enabled: z.boolean(),
  parameters: parameterSchema,
}).strict();

export const studioClipSchema = z.object({
  id: identifierSchema,
  assetId: identifierSchema.nullable(),
  name: z.string().trim().min(1).max(120),
  startTicks: tickSchema,
  durationTicks: durationTickSchema,
  sourceInTicks: tickSchema,
  gainDb: z.number().min(-96).max(24).default(0),
  opacity: z.number().min(0).max(1).default(1),
  effects: z.array(studioEffectSchema).max(32).default([]),
}).strict();

export const studioTrackSchema = z.object({
  id: identifierSchema,
  kind: z.enum(["VIDEO", "AUDIO", "GRAPHICS", "CONTROL"]),
  name: z.string().trim().min(1).max(80),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(studioClipSchema).max(2000).default([]),
}).strict();

export const studioMixerChannelSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(80),
  sourceTrackId: identifierSchema.nullable(),
  layout: z.enum(["MONO", "STEREO"]),
  gainDb: z.number().min(-96).max(24).default(0),
  pan: z.number().min(-1).max(1).default(0),
  muted: z.boolean().default(false),
  soloed: z.boolean().default(false),
  effects: z.array(studioEffectSchema).max(32).default([]),
}).strict();

export const studioSceneSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(80),
  sourceTrackIds: z.array(identifierSchema).max(64),
  transition: z.enum(["CUT", "DISSOLVE", "FADE"]),
  transitionMs: z.number().int().min(0).max(10_000),
}).strict();

export const studioRundownItemSchema = z.object({
  id: identifierSchema,
  type: z.enum(["SCENE", "CLIP", "SOUND_EFFECT", "GRAPHIC", "NOTE"]),
  label: z.string().trim().min(1).max(160),
  scheduledTicks: tickSchema.nullable(),
  targetId: identifierSchema.nullable(),
}).strict();

export const studioRadioBoardSchema = z.object({
  decks: z.object({
    A: z.object({ assetId: identifierSchema.nullable(), cueTicks: tickSchema.default("0"), loop: z.boolean().default(false) }).strict(),
    B: z.object({ assetId: identifierSchema.nullable(), cueTicks: tickSchema.default("0"), loop: z.boolean().default(false) }).strict(),
  }).strict(),
  carts: z.array(z.object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(80),
    assetId: identifierSchema.nullable(),
    gainDb: z.number().min(-60).max(12).default(0),
    color: z.enum(["RED", "AMBER", "GREEN", "BLUE", "PURPLE"]).default("RED"),
    retrigger: z.enum(["RESTART", "LAYER"]).default("RESTART"),
  }).strict()).max(8),
}).strict();

const outputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TV"), width: z.literal(1280), height: z.literal(720), frameRate: z.literal(30) }).strict(),
  z.object({ kind: z.literal("RADIO"), sampleRate: z.literal(48_000), channels: z.literal(2) }).strict(),
]);

export const studioProjectDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  timebase: z.object({ ticksPerSecond: z.literal(48_000) }).strict(),
  output: outputSchema,
  tracks: z.array(studioTrackSchema).max(256),
  mixer: z.object({
    channels: z.array(studioMixerChannelSchema).max(256),
    masterEffects: z.array(studioEffectSchema).max(32),
    crossfader: z.number().min(-1).max(1).default(0),
  }).strict(),
  scenes: z.array(studioSceneSchema).max(256),
  rundown: z.array(studioRundownItemSchema).max(2000),
  radioBoard: studioRadioBoardSchema.nullable().default(null),
}).strict().superRefine((document, context) => {
  const entityIds = new Set<string>();
  const trackKinds = new Map(document.tracks.map((track) => [track.id, track.kind]));
  const sceneIds = new Set(document.scenes.map((scene) => scene.id));
  const clipKinds = new Map<string, (typeof document.tracks)[number]["kind"]>();
  let clipCount = 0;
  let effectCount = document.mixer.masterEffects.length;
  let effectParameterCount = document.mixer.masterEffects.reduce((total, effect) => total + Object.keys(effect.parameters).length, 0);

  const addEntityId = (id: string, path: (string | number)[]) => {
    if (entityIds.has(id)) {
      context.addIssue({ code: "custom", path, message: "Document entity IDs must be unique." });
    } else {
      entityIds.add(id);
    }
  };

  for (const [trackIndex, track] of document.tracks.entries()) {
    addEntityId(track.id, ["tracks", trackIndex, "id"]);
    if (document.output.kind === "RADIO" && track.kind !== "AUDIO" && track.kind !== "CONTROL") {
      context.addIssue({ code: "custom", path: ["tracks", trackIndex, "kind"], message: "Radio projects may only contain audio and control tracks." });
    }
    clipCount += track.clips.length;
    for (const [clipIndex, clip] of track.clips.entries()) {
      addEntityId(clip.id, ["tracks", trackIndex, "clips", clipIndex, "id"]);
      clipKinds.set(clip.id, track.kind);
      effectCount += clip.effects.length;
      for (const [effectIndex, effect] of clip.effects.entries()) {
        addEntityId(effect.id, ["tracks", trackIndex, "clips", clipIndex, "effects", effectIndex, "id"]);
        effectParameterCount += Object.keys(effect.parameters).length;
      }
    }
  }

  for (const [index, channel] of document.mixer.channels.entries()) {
    addEntityId(channel.id, ["mixer", "channels", index, "id"]);
    effectCount += channel.effects.length;
    for (const [effectIndex, effect] of channel.effects.entries()) {
      addEntityId(effect.id, ["mixer", "channels", index, "effects", effectIndex, "id"]);
      effectParameterCount += Object.keys(effect.parameters).length;
    }
    if (channel.sourceTrackId && trackKinds.get(channel.sourceTrackId) !== "AUDIO") {
      context.addIssue({ code: "custom", path: ["mixer", "channels", index, "sourceTrackId"], message: "Mixer channels must reference an audio track." });
    }
  }
  for (const [effectIndex, effect] of document.mixer.masterEffects.entries()) {
    addEntityId(effect.id, ["mixer", "masterEffects", effectIndex, "id"]);
  }
  for (const [sceneIndex, scene] of document.scenes.entries()) {
    addEntityId(scene.id, ["scenes", sceneIndex, "id"]);
    const sourceIds = new Set<string>();
    for (const [sourceIndex, sourceTrackId] of scene.sourceTrackIds.entries()) {
      const sourceKind = trackKinds.get(sourceTrackId);
      if (sourceKind !== "VIDEO" && sourceKind !== "GRAPHICS") {
        context.addIssue({ code: "custom", path: ["scenes", sceneIndex, "sourceTrackIds", sourceIndex], message: "Scene sources must reference a video or graphics track." });
      }
      if (sourceIds.has(sourceTrackId)) {
        context.addIssue({ code: "custom", path: ["scenes", sceneIndex, "sourceTrackIds", sourceIndex], message: "Scene source tracks must be unique." });
      }
      sourceIds.add(sourceTrackId);
    }
    if (document.output.kind === "RADIO") {
      context.addIssue({ code: "custom", path: ["scenes", sceneIndex], message: "Radio projects cannot define video scenes." });
    }
  }
  for (const [itemIndex, item] of document.rundown.entries()) {
    addEntityId(item.id, ["rundown", itemIndex, "id"]);
    if (!item.targetId) continue;
    const targetKind = clipKinds.get(item.targetId);
    const validTarget = item.type === "SCENE"
      ? sceneIds.has(item.targetId)
      : item.type === "CLIP"
        ? targetKind !== undefined
        : item.type === "SOUND_EFFECT"
          ? targetKind === "AUDIO"
          : item.type === "GRAPHIC"
            ? targetKind === "GRAPHICS"
            : false;
    if (!validTarget) {
      context.addIssue({ code: "custom", path: ["rundown", itemIndex, "targetId"], message: "Rundown targets must match the item type." });
    }
  }
  if (document.radioBoard) {
    if (document.output.kind !== "RADIO") context.addIssue({ code: "custom", path: ["radioBoard"], message: "Only Radio projects may define a Radio board." });
    for (const [cartIndex, cart] of document.radioBoard.carts.entries()) addEntityId(cart.id, ["radioBoard", "carts", cartIndex, "id"]);
  }
  if (clipCount > maxDocumentClips) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentClips} clips.` });
  }
  if (effectCount > maxDocumentEffects) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentEffects} effects.` });
  }
  if (effectParameterCount > maxDocumentEffectParameters) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentEffectParameters} effect parameters.` });
  }
});

export const studioNormalizedRectSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
}).strict().superRefine((rect, context) => {
  if (rect.x + rect.width > 1) {
    context.addIssue({ code: "custom", path: ["width"], message: "Normalized rectangles may not extend beyond the right edge." });
  }
  if (rect.y + rect.height > 1) {
    context.addIssue({ code: "custom", path: ["height"], message: "Normalized rectangles may not extend beyond the bottom edge." });
  }
});

const tvSourceBase = {
  id: identifierSchema,
  name: z.string().trim().min(1).max(80),
};

export const studioTvSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    ...tvSourceBase,
    kind: z.literal("MEDIA"),
    mediaType: z.enum(["VIDEO", "IMAGE"]),
    assetId: identifierSchema,
  }).strict(),
  z.object({ ...tvSourceBase, kind: z.literal("COLOR"), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors must use six-digit hexadecimal notation.") }).strict(),
  z.object({ ...tvSourceBase, kind: z.literal("BLACK") }).strict(),
]);

export const studioSceneLayerV2Schema = z.object({
  id: identifierSchema,
  sourceId: identifierSchema,
  rect: studioNormalizedRectSchema,
  crop: studioNormalizedRectSchema.default({ x: 0, y: 0, width: 1, height: 1 }),
  fit: z.enum(["CONTAIN", "COVER", "FILL"]),
  opacity: z.number().finite().min(0).max(1),
  z: z.number().int(),
  visible: z.boolean(),
  locked: z.boolean(),
}).strict();

export const studioSceneV2Schema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(80),
  layers: z.array(studioSceneLayerV2Schema).max(64),
  transition: z.enum(["CUT", "DISSOLVE", "FADE_THROUGH_BLACK"]),
  transitionMs: z.number().int().min(0).max(10_000),
}).strict();

export const studioTvBoardSchema = z.object({
  sources: z.array(studioTvSourceSchema).max(256),
  initialPreviewSceneId: identifierSchema,
  initialProgramSceneId: identifierSchema,
  editor: z.object({
    showSafeAreas: z.boolean(),
    snapToGrid: z.boolean(),
    gridSize: z.number().int().min(2).max(64),
  }).strict(),
}).strict();

const tvOutputSchema = z.object({ kind: z.literal("TV"), width: z.literal(1280), height: z.literal(720), frameRate: z.literal(30) }).strict();

export const studioProjectDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  timebase: z.object({ ticksPerSecond: z.literal(48_000) }).strict(),
  output: tvOutputSchema,
  tracks: z.array(studioTrackSchema).max(256),
  mixer: z.object({
    channels: z.array(studioMixerChannelSchema).max(256),
    masterEffects: z.array(studioEffectSchema).max(32),
    crossfader: z.number().min(-1).max(1).default(0),
  }).strict(),
  scenes: z.array(studioSceneV2Schema).max(256),
  rundown: z.array(studioRundownItemSchema).max(2000),
  radioBoard: studioRadioBoardSchema.nullable().default(null),
  tvBoard: studioTvBoardSchema,
}).strict().superRefine((document, context) => {
  const entityIds = new Set<string>();
  const trackKinds = new Map(document.tracks.map((track) => [track.id, track.kind]));
  const sceneIds = new Set(document.scenes.map((scene) => scene.id));
  const sourceIds = new Set(document.tvBoard.sources.map((source) => source.id));
  const clipKinds = new Map<string, (typeof document.tracks)[number]["kind"]>();
  let clipCount = 0;
  let effectCount = document.mixer.masterEffects.length;
  let effectParameterCount = document.mixer.masterEffects.reduce((total, effect) => total + Object.keys(effect.parameters).length, 0);

  const addEntityId = (id: string, path: (string | number)[]) => {
    if (entityIds.has(id)) {
      context.addIssue({ code: "custom", path, message: "Document entity IDs must be unique." });
    } else {
      entityIds.add(id);
    }
  };

  for (const [trackIndex, track] of document.tracks.entries()) {
    addEntityId(track.id, ["tracks", trackIndex, "id"]);
    clipCount += track.clips.length;
    for (const [clipIndex, clip] of track.clips.entries()) {
      addEntityId(clip.id, ["tracks", trackIndex, "clips", clipIndex, "id"]);
      clipKinds.set(clip.id, track.kind);
      effectCount += clip.effects.length;
      for (const [effectIndex, effect] of clip.effects.entries()) {
        addEntityId(effect.id, ["tracks", trackIndex, "clips", clipIndex, "effects", effectIndex, "id"]);
        effectParameterCount += Object.keys(effect.parameters).length;
      }
    }
  }

  for (const [index, channel] of document.mixer.channels.entries()) {
    addEntityId(channel.id, ["mixer", "channels", index, "id"]);
    effectCount += channel.effects.length;
    for (const [effectIndex, effect] of channel.effects.entries()) {
      addEntityId(effect.id, ["mixer", "channels", index, "effects", effectIndex, "id"]);
      effectParameterCount += Object.keys(effect.parameters).length;
    }
    if (channel.sourceTrackId && trackKinds.get(channel.sourceTrackId) !== "AUDIO") {
      context.addIssue({ code: "custom", path: ["mixer", "channels", index, "sourceTrackId"], message: "Mixer channels must reference an audio track." });
    }
  }
  for (const [effectIndex, effect] of document.mixer.masterEffects.entries()) {
    addEntityId(effect.id, ["mixer", "masterEffects", effectIndex, "id"]);
  }

  const singletonSourceKinds = new Set<"BLACK">();
  for (const [sourceIndex, source] of document.tvBoard.sources.entries()) {
    addEntityId(source.id, ["tvBoard", "sources", sourceIndex, "id"]);
    if (source.kind !== "BLACK") continue;
    if (singletonSourceKinds.has(source.kind)) {
      context.addIssue({ code: "custom", path: ["tvBoard", "sources", sourceIndex, "kind"], message: `TV projects may define only one ${source.kind.toLowerCase()} source.` });
    }
    singletonSourceKinds.add(source.kind);
  }

  for (const [sceneIndex, scene] of document.scenes.entries()) {
    addEntityId(scene.id, ["scenes", sceneIndex, "id"]);
    for (const [layerIndex, layer] of scene.layers.entries()) {
      addEntityId(layer.id, ["scenes", sceneIndex, "layers", layerIndex, "id"]);
      if (!sourceIds.has(layer.sourceId)) {
        context.addIssue({ code: "custom", path: ["scenes", sceneIndex, "layers", layerIndex, "sourceId"], message: "Scene layers must reference a TV source." });
      }
    }
  }

  if (!sceneIds.has(document.tvBoard.initialPreviewSceneId)) {
    context.addIssue({ code: "custom", path: ["tvBoard", "initialPreviewSceneId"], message: "The initial Preview scene must reference a scene in this project." });
  }
  if (!sceneIds.has(document.tvBoard.initialProgramSceneId)) {
    context.addIssue({ code: "custom", path: ["tvBoard", "initialProgramSceneId"], message: "The initial Program scene must reference a scene in this project." });
  }

  for (const [itemIndex, item] of document.rundown.entries()) {
    addEntityId(item.id, ["rundown", itemIndex, "id"]);
    if (!item.targetId) continue;
    const targetKind = clipKinds.get(item.targetId);
    const validTarget = item.type === "SCENE"
      ? sceneIds.has(item.targetId)
      : item.type === "CLIP"
        ? targetKind !== undefined
        : item.type === "SOUND_EFFECT"
          ? targetKind === "AUDIO"
          : item.type === "GRAPHIC"
            ? targetKind === "GRAPHICS"
            : false;
    if (!validTarget) {
      context.addIssue({ code: "custom", path: ["rundown", itemIndex, "targetId"], message: "Rundown targets must match the item type." });
    }
  }
  if (document.radioBoard) {
    context.addIssue({ code: "custom", path: ["radioBoard"], message: "Only Radio projects may define a Radio board." });
    for (const [cartIndex, cart] of document.radioBoard.carts.entries()) addEntityId(cart.id, ["radioBoard", "carts", cartIndex, "id"]);
  }
  if (clipCount > maxDocumentClips) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentClips} clips.` });
  }
  if (effectCount > maxDocumentEffects) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentEffects} effects.` });
  }
  if (effectParameterCount > maxDocumentEffectParameters) {
    context.addIssue({ code: "custom", path: ["tracks"], message: `Projects may contain at most ${maxDocumentEffectParameters} effect parameters.` });
  }
});

export const studioProjectDocumentSchema = z.union([studioProjectDocumentV1Schema, studioProjectDocumentV2Schema]);

export type StudioProjectDocumentV1 = z.infer<typeof studioProjectDocumentV1Schema>;
export type StudioProjectDocumentV2 = z.infer<typeof studioProjectDocumentV2Schema>;
export type StudioProjectDocument = z.infer<typeof studioProjectDocumentSchema>;
export type StudioSceneV1 = z.infer<typeof studioSceneSchema>;
export type StudioSceneV2 = z.infer<typeof studioSceneV2Schema>;
export type StudioScene = StudioSceneV1 | StudioSceneV2;
export type StudioTvSource = z.infer<typeof studioTvSourceSchema>;
export type StudioTvScene = StudioSceneV2;
export type StudioTvSceneLayer = z.infer<typeof studioSceneLayerV2Schema>;
export type StudioSceneLayerV2 = StudioTvSceneLayer;

export const studioSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  expectedVersion: z.number().int().min(0),
}).strict();

export const studioProjectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
}).strict();

export const studioProjectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  document: studioProjectDocumentSchema.optional(),
  expectedDraftVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict().refine((value) => value.name !== undefined || value.description !== undefined || value.document !== undefined, {
  message: "Supply at least one project change.",
});

export const studioProjectPublishSchema = z.object({
  expectedDraftVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();

export const studioProjectUpgradeSchema = z.object({
  targetSchemaVersion: z.literal(2),
  expectedDraftVersion: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();

export const radioStudioSessionCreateSchema = z.object({
  projectId: identifierSchema,
  projectReleaseId: identifierSchema,
  occurrenceId: identifierSchema.optional(),
  label: z.string().trim().min(1).max(120),
  presenter: z.string().trim().max(120).default(""),
}).strict();

export const radioStudioSessionFenceSchema = z.object({
  producerFence: z.string().regex(/^[1-9]\d{0,18}$/),
}).strict();

export const radioStudioSessionEndSchema = radioStudioSessionFenceSchema.extend({
  reason: z.string().trim().min(1).max(240).default("OWNER_ENDED"),
}).strict();

export const radioStudioSourceCommandSchema = radioStudioSessionFenceSchema.extend({
  expectedControlVersion: z.number().int().positive(),
}).strict();

export const radioStudioTakeCommandSchema = radioStudioSourceCommandSchema.extend({
  recordProgram: z.boolean().default(false),
  recordingRequestId: z.string().uuid().optional(),
  rightsConfirmed: z.literal(true).optional(),
  maxRecordingSeconds: z.number().int().min(1).max(14_400).optional(),
}).strict().superRefine((value, context) => {
  if (!value.recordProgram) return;
  if (!value.recordingRequestId) context.addIssue({ code: "custom", path: ["recordingRequestId"], message: "A recording request ID is required." });
  if (value.rightsConfirmed !== true) context.addIssue({ code: "custom", path: ["rightsConfirmed"], message: "Recording rights must be confirmed." });
});

export const tvStudioSessionCreateSchema = z.object({
  projectId: identifierSchema,
  projectReleaseId: identifierSchema,
  occurrenceId: identifierSchema.optional(),
  requestedRenditionMode: z.enum(["DUAL", "HD_ONLY"]),
  label: z.string().trim().min(1).max(120),
  presenter: z.string().trim().max(120).default(""),
}).strict();

export const tvStudioSessionFenceSchema = z.object({
  producerFence: z.string().regex(/^[1-9]\d{0,18}$/),
}).strict();

export const tvStudioSessionEndSchema = tvStudioSessionFenceSchema.extend({
  reason: z.string().trim().min(1).max(240).default("OWNER_ENDED"),
}).strict();

export const tvStudioSourceCommandSchema = tvStudioSessionFenceSchema.extend({
  expectedControlVersion: z.number().int().positive(),
}).strict();

export const tvStudioTakeCommandSchema = tvStudioSourceCommandSchema.extend({
  recordProgram: z.boolean().default(false),
  recordingRequestId: z.string().uuid().optional(),
  rightsConfirmed: z.literal(true).optional(),
  maxRecordingSeconds: z.number().int().min(1).max(14_400).optional(),
}).strict().superRefine((value, context) => {
  if (!value.recordProgram) return;
  if (!value.recordingRequestId) context.addIssue({ code: "custom", path: ["recordingRequestId"], message: "A TV recording request ID is required." });
  if (value.rightsConfirmed !== true) context.addIssue({ code: "custom", path: ["rightsConfirmed"], message: "TV recording rights must be confirmed." });
});

function defaultStudioProjectDocumentV1(kind: StationKind): StudioProjectDocumentV1 {
  const track = (trackKind: "VIDEO" | "AUDIO" | "GRAPHICS", name: string) => ({
    id: crypto.randomUUID(),
    kind: trackKind,
    name,
    muted: false,
    locked: false,
    clips: [],
  });
  const tracks = kind === "TV"
    ? [track("VIDEO", "Video 1"), track("GRAPHICS", "Graphics 1"), track("AUDIO", "Audio 1")]
    : [track("AUDIO", "Deck A"), track("AUDIO", "Deck B"), track("AUDIO", "Microphone"), track("AUDIO", "Sound effects")];
  const audioTracks = tracks.filter((item) => item.kind === "AUDIO");
  return {
    schemaVersion: 1,
    timebase: { ticksPerSecond: 48_000 },
    output: kind === "TV"
      ? { kind: "TV", width: 1280, height: 720, frameRate: 30 }
      : { kind: "RADIO", sampleRate: 48_000, channels: 2 },
    tracks,
    mixer: {
      channels: audioTracks.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        sourceTrackId: item.id,
        layout: "STEREO" as const,
        gainDb: 0,
        pan: 0,
        muted: false,
        soloed: false,
        effects: [],
      })),
      masterEffects: [],
      crossfader: 0,
    },
    scenes: kind === "TV" ? [{
      id: crypto.randomUUID(),
      name: "Program",
      sourceTrackIds: tracks.filter((item) => item.kind !== "AUDIO").map((item) => item.id),
      transition: "CUT",
      transitionMs: 0,
    }] : [],
    rundown: [],
    radioBoard: kind === "RADIO" ? {
      decks: {
        A: { assetId: null, cueTicks: "0", loop: false },
        B: { assetId: null, cueTicks: "0", loop: false },
      },
      carts: Array.from({ length: 8 }, (_, index) => ({
        id: crypto.randomUUID(),
        label: `Cart ${index + 1}`,
        assetId: null,
        gainDb: 0,
        color: (["RED", "AMBER", "GREEN", "BLUE", "PURPLE"] as const)[index % 5],
        retrigger: "RESTART" as const,
      })),
    } : null,
  };
}

export function upgradeTvStudioProjectDocumentV1ToV2(document: StudioProjectDocumentV1): StudioProjectDocumentV2 {
  const legacy = studioProjectDocumentV1Schema.parse(document);
  if (legacy.output.kind !== "TV") throw new Error("Only TV production project documents can be upgraded to V2.");

  const blackSourceId = crypto.randomUUID();
  const blackSceneId = legacy.scenes[0]?.id ?? crypto.randomUUID();
  const fullRect = { x: 0, y: 0, width: 1, height: 1 };
  const firstLegacyScene = legacy.scenes[0];
  const transition: StudioSceneV2["transition"] = firstLegacyScene?.transition === "FADE"
    ? "FADE_THROUGH_BLACK"
    : firstLegacyScene?.transition ?? "CUT";

  const layer = (sourceId: string, z: number, rect = fullRect, fit: StudioTvSceneLayer["fit"] = "COVER"): StudioTvSceneLayer => ({
    id: crypto.randomUUID(),
    sourceId,
    rect,
    crop: fullRect,
    fit,
    opacity: 1,
    z,
    visible: true,
    locked: false,
  });

  const scenes: StudioSceneV2[] = [{
      id: blackSceneId,
      name: "Black",
      layers: [layer(blackSourceId, 0, fullRect, "FILL")],
      transition,
      transitionMs: firstLegacyScene?.transitionMs ?? 0,
    }];

  const upgraded: StudioProjectDocumentV2 = {
    schemaVersion: 2,
    timebase: legacy.timebase,
    output: legacy.output,
    tracks: legacy.tracks,
    mixer: legacy.mixer,
    scenes,
    rundown: legacy.rundown.map((item) => item.type === "SCENE" && item.targetId !== null && item.targetId !== blackSceneId
      ? { ...item, targetId: blackSceneId }
      : item),
    radioBoard: null,
    tvBoard: {
      sources: [{ id: blackSourceId, name: "Black", kind: "BLACK" }],
      initialPreviewSceneId: blackSceneId,
      initialProgramSceneId: blackSceneId,
      editor: {
        showSafeAreas: true,
        snapToGrid: true,
        gridSize: 8,
      },
    },
  };
  return studioProjectDocumentV2Schema.parse(upgraded);
}

export function defaultStudioProjectDocument(kind: "TV"): StudioProjectDocumentV2;
export function defaultStudioProjectDocument(kind: "RADIO"): StudioProjectDocumentV1;
export function defaultStudioProjectDocument(kind: StationKind): StudioProjectDocument;
export function defaultStudioProjectDocument(kind: StationKind): StudioProjectDocument {
  const document = defaultStudioProjectDocumentV1(kind);
  return kind === "TV" ? upgradeTvStudioProjectDocumentV1ToV2(document) : document;
}
