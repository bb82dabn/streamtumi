import { describe, expect, it } from "vitest";
import {
  defaultStudioProjectDocument,
  studioProjectDocumentSchema,
  studioProjectDocumentV1Schema,
  studioProjectDocumentV2Schema,
  studioProjectPublishSchema,
  studioProjectUpdateSchema,
  radioStudioSessionCreateSchema,
  studioSettingsUpdateSchema,
  tvStudioSessionCreateSchema,
  upgradeTvStudioProjectDocumentV1ToV2,
  type StudioProjectDocumentV1,
} from "@/lib/studio-model";

function historicalTvDocument(): StudioProjectDocumentV1 {
  const videoTrackId = crypto.randomUUID();
  const graphicsTrackId = crypto.randomUUID();
  const audioTrackId = crypto.randomUUID();
  return studioProjectDocumentV1Schema.parse({
    schemaVersion: 1,
    timebase: { ticksPerSecond: 48_000 },
    output: { kind: "TV", width: 1280, height: 720, frameRate: 30 },
    tracks: [
      { id: videoTrackId, kind: "VIDEO", name: "Video 1", muted: false, locked: false, clips: [] },
      { id: graphicsTrackId, kind: "GRAPHICS", name: "Graphics 1", muted: false, locked: false, clips: [] },
      { id: audioTrackId, kind: "AUDIO", name: "Audio 1", muted: false, locked: false, clips: [] },
    ],
    mixer: {
      channels: [{
        id: crypto.randomUUID(),
        name: "Audio 1",
        sourceTrackId: audioTrackId,
        layout: "STEREO",
        gainDb: 0,
        pan: 0,
        muted: false,
        soloed: false,
        effects: [],
      }],
      masterEffects: [],
      crossfader: 0,
    },
    scenes: [{
      id: crypto.randomUUID(),
      name: "Program",
      sourceTrackIds: [videoTrackId, graphicsTrackId],
      transition: "CUT",
      transitionMs: 0,
    }],
    rundown: [],
    radioBoard: null,
  });
}

describe("Studio project model", () => {
  it("strictly parses historical V1 documents through both schema exports", () => {
    const historical = historicalTvDocument();

    expect(studioProjectDocumentV1Schema.parse(historical)).toEqual(historical);
    expect(studioProjectDocumentSchema.parse(historical)).toEqual(historical);
    expect(studioProjectDocumentV1Schema.safeParse({ ...historical, tvBoard: {} }).success).toBe(false);
    expect(studioProjectDocumentV1Schema.safeParse({ ...historical, schemaVersion: 2 }).success).toBe(false);
  });

  it("creates V2 TV defaults while preserving V1 Radio defaults", () => {
    const tv = defaultStudioProjectDocument("TV");
    const radio = defaultStudioProjectDocument("RADIO");

    expect(tv.schemaVersion).toBe(2);
    expect(tv.timebase.ticksPerSecond).toBe(48_000);
    expect(tv.output).toEqual({ kind: "TV", width: 1280, height: 720, frameRate: 30 });
    expect(tv.tracks.map((track) => track.kind)).toEqual(["VIDEO", "GRAPHICS", "AUDIO"]);
    expect(tv.tvBoard.sources.map((source) => [source.name, source.kind])).toEqual([
      ["Black", "BLACK"],
    ]);
    expect(tv.scenes.map((scene) => scene.name)).toEqual(["Black"]);
    expect(tv.scenes[0].layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(tv.scenes.some((scene) => scene.id === tv.tvBoard.initialPreviewSceneId)).toBe(true);
    expect(tv.scenes.some((scene) => scene.id === tv.tvBoard.initialProgramSceneId)).toBe(true);
    expect(studioProjectDocumentV2Schema.parse(tv)).toEqual(tv);
    expect(studioProjectDocumentSchema.parse(tv)).toEqual(tv);

    expect(radio.schemaVersion).toBe(1);
    expect(radio.output).toEqual({ kind: "RADIO", sampleRate: 48_000, channels: 2 });
    expect(radio.tracks.map((track) => track.name)).toEqual(["Deck A", "Deck B", "Microphone", "Sound effects"]);
    expect(radio.radioBoard?.carts).toHaveLength(8);
    expect(studioProjectDocumentV1Schema.parse(radio)).toEqual(radio);
    expect(studioProjectDocumentSchema.parse(radio)).toEqual(radio);
  });

  it("rejects dangling historical mixer and scene references", () => {
    const document = historicalTvDocument();
    document.mixer.channels[0].sourceTrackId = crypto.randomUUID();
    document.scenes[0].sourceTrackIds.push(crypto.randomUUID());

    const result = studioProjectDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "mixer.channels.0.sourceTrackId",
      "scenes.0.sourceTrackIds.2",
    ]));
  });

  it("requires globally unique V1 entity IDs and kind-correct references", () => {
    const document = historicalTvDocument();
    document.mixer.channels[0].id = document.tracks[0].id;
    document.mixer.channels[0].sourceTrackId = document.tracks[0].id;
    document.scenes[0].sourceTrackIds.push(document.tracks[2].id);

    const result = studioProjectDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "mixer.channels.0.id",
      "mixer.channels.0.sourceTrackId",
      "scenes.0.sourceTrackIds.2",
    ]));
  });

  it("validates V2 source and layer references as globally unique entities", () => {
    const document = defaultStudioProjectDocument("TV");
    document.scenes[0].layers[0].sourceId = crypto.randomUUID();
    document.scenes[0].layers[0].id = document.tracks[0].id;

    const result = studioProjectDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "scenes.0.layers.0.sourceId",
      "scenes.0.layers.0.id",
    ]));
  });

  it("enforces singleton generated sources and structural media compatibility", () => {
    const document = defaultStudioProjectDocument("TV");
    const valid = {
      ...document,
      tvBoard: {
        ...document.tvBoard,
        sources: [
          ...document.tvBoard.sources,
          { id: crypto.randomUUID(), name: "Package", kind: "MEDIA" as const, mediaType: "VIDEO" as const, assetId: crypto.randomUUID() },
          { id: crypto.randomUUID(), name: "Key", kind: "COLOR" as const, color: "#12aBcF" },
        ],
      },
    };
    expect(studioProjectDocumentV2Schema.safeParse(valid).success).toBe(true);

    const duplicateBlack = {
      ...document,
      tvBoard: {
        ...document.tvBoard,
        sources: [...document.tvBoard.sources, { id: crypto.randomUUID(), name: "Black 2", kind: "BLACK" as const }],
      },
    };
    const duplicateResult = studioProjectDocumentV2Schema.safeParse(duplicateBlack);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) expect(duplicateResult.error.issues.map((issue) => issue.path.join("."))).toContain("tvBoard.sources.1.kind");

    expect(studioProjectDocumentV2Schema.safeParse({
      ...document,
      tvBoard: {
        ...document.tvBoard,
        sources: [...document.tvBoard.sources, { id: crypto.randomUUID(), name: "Broken media", kind: "MEDIA", assetId: crypto.randomUUID() }],
      },
    }).success).toBe(false);
    expect(studioProjectDocumentV2Schema.safeParse({
      ...document,
      tvBoard: {
        ...document.tvBoard,
        sources: [...document.tvBoard.sources, { id: crypto.randomUUID(), name: "Bad color", kind: "COLOR", color: "black" }],
      },
    }).success).toBe(false);
  });

  it("defaults full source crops and rejects rectangles extending beyond one", () => {
    const document = defaultStudioProjectDocument("TV");
    const layerWithoutCrop = structuredClone(document.scenes[0].layers[0]);
    delete (layerWithoutCrop as Partial<typeof layerWithoutCrop>).crop;
    const withoutCrop = {
      ...document,
      scenes: [{ ...document.scenes[0], layers: [layerWithoutCrop] }, ...document.scenes.slice(1)],
    };
    expect(studioProjectDocumentV2Schema.parse(withoutCrop).scenes[0].layers[0].crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });

    document.scenes[0].layers[0].rect.x = 0.25;
    document.scenes[0].layers[0].rect.width = 0.8;
    document.scenes[0].layers[0].crop.y = 0.1;
    document.scenes[0].layers[0].crop.height = 1;
    const result = studioProjectDocumentV2Schema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "scenes.0.layers.0.rect.width",
      "scenes.0.layers.0.crop.height",
    ]));
  });

  it("requires initial V2 Preview and Program references to exist", () => {
    const document = defaultStudioProjectDocument("TV");
    document.tvBoard.initialPreviewSceneId = crypto.randomUUID();
    document.tvBoard.initialProgramSceneId = crypto.randomUUID();

    const result = studioProjectDocumentV2Schema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "tvBoard.initialPreviewSceneId",
      "tvBoard.initialProgramSceneId",
    ]));
  });

  it("upgrades V1 TV explicitly while preserving production data", () => {
    const historical = historicalTvDocument();
    historical.scenes[0].transition = "FADE";
    historical.scenes[0].transitionMs = 750;
    historical.rundown.push({
      id: crypto.randomUUID(),
      type: "SCENE",
      label: "Opening",
      scheduledTicks: null,
      targetId: historical.scenes[0].id,
    });
    const oldSceneId = historical.scenes[0].id;
    const tracks = structuredClone(historical.tracks);
    const mixer = structuredClone(historical.mixer);
    const rundown = structuredClone(historical.rundown);

    const upgraded = upgradeTvStudioProjectDocumentV1ToV2(historical);

    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.tracks).toEqual(tracks);
    expect(upgraded.mixer).toEqual(mixer);
    expect(upgraded.rundown).toEqual(rundown);
    expect(upgraded.scenes[0]).toMatchObject({ id: oldSceneId, name: "Black", transition: "FADE_THROUGH_BLACK", transitionMs: 750 });
    expect(upgraded.scenes.map((scene) => scene.name)).toEqual(["Black"]);
    expect(new Set(upgraded.tvBoard.sources.map((source) => source.id)).size).toBe(1);
    expect(studioProjectDocumentV2Schema.parse(upgraded)).toEqual(upgraded);

    expect(() => upgradeTvStudioProjectDocumentV1ToV2(defaultStudioProjectDocument("RADIO"))).toThrow("Only TV production project documents can be upgraded to V2.");
  });

  it("rejects visual tracks and scenes in V1 Radio documents and any V2 Radio shape", () => {
    const radio = defaultStudioProjectDocument("RADIO");
    const tv = historicalTvDocument();
    radio.tracks.push(tv.tracks[0]);
    radio.scenes.push(tv.scenes[0]);

    const result = studioProjectDocumentSchema.safeParse(radio);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
      "tracks.4.kind",
      "scenes.0",
    ]));

    const v2 = defaultStudioProjectDocument("TV");
    expect(studioProjectDocumentSchema.safeParse({
      ...v2,
      output: { kind: "RADIO", sampleRate: 48_000, channels: 2 },
    }).success).toBe(false);
  });

  it("caps aggregate clips and effect parameter maps in historical documents", () => {
    const document = historicalTvDocument();
    document.mixer.channels = [];
    document.scenes = [];
    document.tracks = Array.from({ length: 6 }, (_, trackIndex) => ({
      id: crypto.randomUUID(),
      kind: "VIDEO" as const,
      name: `Video ${trackIndex}`,
      muted: false,
      locked: false,
      clips: Array.from({ length: 1667 }, (_, clipIndex) => ({
        id: crypto.randomUUID(),
        assetId: null,
        name: `Clip ${clipIndex}`,
        startTicks: "0",
        durationTicks: "1",
        sourceInTicks: "0",
        gainDb: 0,
        opacity: 1,
        effects: [],
      })),
    }));
    document.mixer.masterEffects.push({
      id: crypto.randomUUID(),
      type: "LIMITER",
      enabled: true,
      parameters: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`parameter-${index}`, index])),
    });

    const result = studioProjectDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "Effects may define at most 64 parameters.",
      "Projects may contain at most 10000 clips.",
    ]));
  });

  it("requires optimistic versions and rejects unknown mutation fields", () => {
    const mutationBase = { expectedDraftVersion: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" };
    expect(studioSettingsUpdateSchema.parse({ enabled: true, expectedVersion: 0 })).toEqual({ enabled: true, expectedVersion: 0 });
    expect(studioSettingsUpdateSchema.safeParse({ enabled: true, expectedVersion: -1 }).success).toBe(false);
    expect(studioSettingsUpdateSchema.safeParse({ enabled: true, expectedVersion: 0, live: true }).success).toBe(false);
    expect(studioProjectUpdateSchema.safeParse({ expectedDraftVersion: 1 }).success).toBe(false);
    expect(studioProjectUpdateSchema.safeParse({ ...mutationBase, document: historicalTvDocument() }).success).toBe(true);
    expect(studioProjectUpdateSchema.safeParse({ ...mutationBase, document: defaultStudioProjectDocument("TV") }).success).toBe(true);
    expect(studioProjectUpdateSchema.safeParse({ name: "Updated show", expectedDraftVersion: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(studioProjectUpdateSchema.safeParse({ name: "Updated show", expectedDraftVersion: 1, idempotencyKey: "not-a-uuid" }).success).toBe(false);
    expect(studioProjectPublishSchema.parse({ expectedDraftVersion: 1, idempotencyKey: "00000000-0000-4000-8000-000000000001" })).toEqual({
      expectedDraftVersion: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });
    expect(studioProjectPublishSchema.safeParse({ expectedDraftVersion: 1, idempotencyKey: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts an optional occurrence binding on Studio session creation", () => {
    const base = {
      projectId: crypto.randomUUID(),
      projectReleaseId: crypto.randomUUID(),
      occurrenceId: crypto.randomUUID(),
      label: "Scheduled live",
      presenter: "Host",
    };
    expect(radioStudioSessionCreateSchema.parse(base).occurrenceId).toBe(base.occurrenceId);
    expect(tvStudioSessionCreateSchema.parse({ ...base, requestedRenditionMode: "HD_ONLY" }).occurrenceId).toBe(base.occurrenceId);
    expect(radioStudioSessionCreateSchema.safeParse({ ...base, occurrenceId: "wrong-release" }).success).toBe(false);
  });
});
