import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  clampNormalizedRect,
  deleteSceneFromDocument,
  deleteSourceFromDocument,
  snapNormalizedValue,
  transformNormalizedRect,
  updateNormalizedRect,
} from "@/components/studio/tv-scene-designer";
import { defaultStudioProjectDocument, studioProjectDocumentV2Schema } from "@/lib/studio-model";

describe("TV scene designer geometry", () => {
  it("clamps normalized rectangles without extending beyond the output", () => {
    expect(clampNormalizedRect({ x: -0.2, y: 0.9, width: 0.4, height: 0.5 })).toEqual({
      x: 0,
      y: 0.5,
      width: 0.4,
      height: 0.5,
    });
    expect(updateNormalizedRect({ x: 0.7, y: 0.1, width: 0.2, height: 0.3 }, "width", 0.8)).toEqual({
      x: 0.7,
      y: 0.1,
      width: 0.3,
      height: 0.3,
    });
  });

  it("moves and resizes with grid, center, and edge snapping", () => {
    expect(snapNormalizedValue(0.14, 8)).toBe(0.125);
    expect(transformNormalizedRect(
      { x: 0.11, y: 0.11, width: 0.2, height: 0.2 },
      "MOVE",
      0.01,
      0.01,
      { snapToGrid: true, gridSize: 8 },
    )).toEqual({ x: 0.125, y: 0.125, width: 0.2, height: 0.2 });
    expect(transformNormalizedRect(
      { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      "MOVE",
      0.09,
      -0.29,
      { snapToGrid: true, gridSize: 8 },
    )).toEqual({ x: 0.4, y: 0, width: 0.2, height: 0.2 });
    expect(transformNormalizedRect(
      { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      "nw",
      -1,
      -1,
      { snapToGrid: false, gridSize: 8 },
    )).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
  });
});

describe("TV scene designer document operations", () => {
  it("deletes a scene immutably and safely repairs buses and rundown targets", () => {
    const document = defaultStudioProjectDocument("TV");
    document.scenes.push({
      ...document.scenes[0],
      id: crypto.randomUUID(),
      name: "Second",
      layers: document.scenes[0].layers.map((layer) => ({ ...layer, id: crypto.randomUUID() })),
    });
    const sceneId = document.scenes[0].id;
    document.tvBoard.initialPreviewSceneId = sceneId;
    document.tvBoard.initialProgramSceneId = sceneId;
    document.rundown.push({
      id: crypto.randomUUID(),
      type: "SCENE",
      label: "Opening",
      scheduledTicks: null,
      targetId: sceneId,
    });
    const before = structuredClone(document);

    const next = deleteSceneFromDocument(document, sceneId);

    expect(document).toEqual(before);
    expect(next.scenes).toHaveLength(before.scenes.length - 1);
    expect(next.scenes.some((scene) => scene.id === next.tvBoard.initialPreviewSceneId)).toBe(true);
    expect(next.scenes.some((scene) => scene.id === next.tvBoard.initialProgramSceneId)).toBe(true);
    expect(next.rundown[0].targetId).toBeNull();
    expect(studioProjectDocumentV2Schema.safeParse(next).success).toBe(true);
  });

  it("retains the final scene and cascade-deletes referenced source layers immutably", () => {
    const document = defaultStudioProjectDocument("TV");
    const oneScene = studioProjectDocumentV2Schema.parse({
      ...document,
      scenes: [document.scenes[0]],
      tvBoard: {
        ...document.tvBoard,
        initialPreviewSceneId: document.scenes[0].id,
        initialProgramSceneId: document.scenes[0].id,
      },
    });
    expect(deleteSceneFromDocument(oneScene, oneScene.scenes[0].id).scenes).toHaveLength(1);

    const sourceId = document.tvBoard.sources.find((source) => source.kind === "BLACK")!.id;
    const before = structuredClone(document);
    const next = deleteSourceFromDocument(document, sourceId);

    expect(document).toEqual(before);
    expect(next.tvBoard.sources.some((source) => source.id === sourceId)).toBe(false);
    expect(next.scenes.flatMap((scene) => scene.layers).some((layer) => layer.sourceId === sourceId)).toBe(false);
    expect(studioProjectDocumentV2Schema.safeParse(next).success).toBe(true);
  });

  it("keeps draft design controls separate from consequential air APIs", async () => {
    const source = await readFile(new URL("../components/studio/tv-scene-designer.tsx", import.meta.url), "utf8");
    expect(source).toContain("setPointerCapture");
    expect(source).toContain("const MAX_HISTORY = 50");
    expect(source).toContain('const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]');
    expect(source).toContain("studioProjectDocumentV2Schema.safeParse(next)");
    expect(source).toContain("uploaded media");
    expect(source).not.toContain("/studio/tv/live/");
    expect(source).not.toContain("Take Studio to Air");
  });

  it("integrates the V2 designer through immutable production document updates", async () => {
    const source = await readFile(new URL("../components/studio-production-console.tsx", import.meta.url), "utf8");
    expect(source).toContain("<TvSceneDesigner");
    expect(source).toContain("document={project.document}");
    expect(source).toContain("mediaAssets={assets}");
    expect(source).toContain("onDocumentChange={(document) => updateProject");
    expect(source).not.toContain("/studio/tv/live/");
  });
});
