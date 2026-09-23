"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  Lock,
  Palette,
  Plus,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Unlock,
  Video,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { MediaAssetSummary } from "@/lib/media-assets";
import {
  studioProjectDocumentV2Schema,
  type StudioProjectDocumentV2,
  type StudioTvSceneLayer,
  type StudioTvSource,
} from "@/lib/studio-model";

export type TvSceneDesignerProps = {
  document: StudioProjectDocumentV2;
  mediaAssets: MediaAssetSummary[];
  onDocumentChange(document: StudioProjectDocumentV2): void;
  disabled?: boolean;
};

export type NormalizedRect = StudioTvSceneLayer["rect"];
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type GeometryTransform = "MOVE" | ResizeHandle;

const MIN_LAYER_SIZE = 0.001;
const MAX_HISTORY = 50;
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SINGLETON_SOURCE_KINDS = ["BLACK"] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rounded(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

export function clampNormalizedRect(rect: NormalizedRect): NormalizedRect {
  const width = clamp(finiteOr(rect.width, MIN_LAYER_SIZE), MIN_LAYER_SIZE, 1);
  const height = clamp(finiteOr(rect.height, MIN_LAYER_SIZE), MIN_LAYER_SIZE, 1);
  return {
    x: rounded(clamp(finiteOr(rect.x, 0), 0, 1 - width)),
    y: rounded(clamp(finiteOr(rect.y, 0), 0, 1 - height)),
    width: rounded(width),
    height: rounded(height),
  };
}

export function updateNormalizedRect(
  rect: NormalizedRect,
  field: keyof NormalizedRect,
  value: number,
): NormalizedRect {
  const next = { ...rect };
  if (field === "x") next.x = clamp(finiteOr(value, rect.x), 0, 1 - rect.width);
  if (field === "y") next.y = clamp(finiteOr(value, rect.y), 0, 1 - rect.height);
  if (field === "width") next.width = clamp(finiteOr(value, rect.width), MIN_LAYER_SIZE, 1 - rect.x);
  if (field === "height") next.height = clamp(finiteOr(value, rect.height), MIN_LAYER_SIZE, 1 - rect.y);
  return {
    x: rounded(next.x),
    y: rounded(next.y),
    width: rounded(next.width),
    height: rounded(next.height),
  };
}

export function snapNormalizedValue(value: number, gridSize: number): number {
  const divisions = clamp(Math.round(finiteOr(gridSize, 8)), 2, 64);
  return rounded(Math.round(value * divisions) / divisions);
}

function snapGuideOrGrid(value: number, gridSize: number): number {
  const threshold = Math.max(0.004, 1 / (gridSize * 8));
  const guide = [0, 0.5, 1].find((candidate) => Math.abs(candidate - value) <= threshold);
  return guide ?? snapNormalizedValue(value, gridSize);
}

function snapPosition(value: number, size: number, gridSize: number): number {
  const threshold = Math.max(0.004, 1 / (gridSize * 8));
  const candidates = [0, 0.5 - size / 2, 1 - size];
  const guide = candidates.find((candidate) => Math.abs(candidate - value) <= threshold);
  return guide ?? snapNormalizedValue(value, gridSize);
}

export function transformNormalizedRect(
  rect: NormalizedRect,
  transform: GeometryTransform,
  deltaX: number,
  deltaY: number,
  options: { snapToGrid: boolean; gridSize: number },
): NormalizedRect {
  const start = clampNormalizedRect(rect);
  if (transform === "MOVE") {
    const x = start.x + finiteOr(deltaX, 0);
    const y = start.y + finiteOr(deltaY, 0);
    return clampNormalizedRect({
      ...start,
      x: options.snapToGrid ? snapPosition(x, start.width, options.gridSize) : x,
      y: options.snapToGrid ? snapPosition(y, start.height, options.gridSize) : y,
    });
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (transform.includes("w")) left += finiteOr(deltaX, 0);
  if (transform.includes("e")) right += finiteOr(deltaX, 0);
  if (transform.includes("n")) top += finiteOr(deltaY, 0);
  if (transform.includes("s")) bottom += finiteOr(deltaY, 0);
  if (options.snapToGrid) {
    if (transform.includes("w")) left = snapGuideOrGrid(left, options.gridSize);
    if (transform.includes("e")) right = snapGuideOrGrid(right, options.gridSize);
    if (transform.includes("n")) top = snapGuideOrGrid(top, options.gridSize);
    if (transform.includes("s")) bottom = snapGuideOrGrid(bottom, options.gridSize);
  }
  left = clamp(left, 0, right - MIN_LAYER_SIZE);
  right = clamp(right, left + MIN_LAYER_SIZE, 1);
  top = clamp(top, 0, bottom - MIN_LAYER_SIZE);
  bottom = clamp(bottom, top + MIN_LAYER_SIZE, 1);
  return {
    x: rounded(left),
    y: rounded(top),
    width: rounded(right - left),
    height: rounded(bottom - top),
  };
}

export function deleteSceneFromDocument(
  document: StudioProjectDocumentV2,
  sceneId: string,
): StudioProjectDocumentV2 {
  if (document.scenes.length <= 1 || !document.scenes.some((scene) => scene.id === sceneId)) {
    return studioProjectDocumentV2Schema.parse(document);
  }
  const removedIndex = document.scenes.findIndex((scene) => scene.id === sceneId);
  const scenes = document.scenes.filter((scene) => scene.id !== sceneId);
  const replacement = scenes[Math.min(removedIndex, scenes.length - 1)].id;
  return studioProjectDocumentV2Schema.parse({
    ...document,
    scenes,
    rundown: document.rundown.map((item) => item.type === "SCENE" && item.targetId === sceneId
      ? { ...item, targetId: null }
      : item),
    tvBoard: {
      ...document.tvBoard,
      initialPreviewSceneId: document.tvBoard.initialPreviewSceneId === sceneId
        ? replacement
        : document.tvBoard.initialPreviewSceneId,
      initialProgramSceneId: document.tvBoard.initialProgramSceneId === sceneId
        ? replacement
        : document.tvBoard.initialProgramSceneId,
    },
  });
}

export function deleteSourceFromDocument(
  document: StudioProjectDocumentV2,
  sourceId: string,
): StudioProjectDocumentV2 {
  return studioProjectDocumentV2Schema.parse({
    ...document,
    scenes: document.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.filter((layer) => layer.sourceId !== sourceId),
    })),
    tvBoard: {
      ...document.tvBoard,
      sources: document.tvBoard.sources.filter((source) => source.id !== sourceId),
    },
  });
}

function sourceKindLabel(source: StudioTvSource): string {
  if (source.kind === "MEDIA") return `MEDIA · ${source.mediaType}`;
  return source.kind;
}

function sourceDescription(source: StudioTvSource): string {
  if (source.kind === "BLACK") return "Generated black frame";
  if (source.kind === "COLOR") return source.color.toUpperCase();
  return `Library ${source.mediaType.toLowerCase()}`;
}

function sourceIcon(source: StudioTvSource) {
  if (source.kind === "BLACK") return <Square size={16} aria-hidden="true" />;
  if (source.kind === "COLOR") return <Palette size={16} aria-hidden="true" />;
  return source.mediaType === "IMAGE"
    ? <ImageIcon size={16} aria-hidden="true" />
    : <Video size={16} aria-hidden="true" />;
}

function nextSceneName(document: StudioProjectDocumentV2): string {
  const names = new Set(document.scenes.map((scene) => scene.name));
  let number = document.scenes.length + 1;
  while (names.has(`Scene ${number}`)) number += 1;
  return `Scene ${number}`;
}

function duplicateName(name: string): string {
  return `Copy of ${name}`.slice(0, 80).trim();
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(element?.closest?.("input, textarea, select, button, [contenteditable]:not([contenteditable='false'])"));
}

function sameRect(left: NormalizedRect, right: NormalizedRect): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

type DragState = {
  pointerId: number;
  sceneId: string;
  layerId: string;
  transform: GeometryTransform;
  originX: number;
  originY: number;
  canvasWidth: number;
  canvasHeight: number;
  rect: NormalizedRect;
  historyStarted: boolean;
};

export function TvSceneDesigner({
  document,
  mediaAssets,
  onDocumentChange,
  disabled = false,
}: TvSceneDesignerProps) {
  const headingId = useId();
  const [draft, setDraft] = useState(() => studioProjectDocumentV2Schema.parse(document));
  const [selectedSceneId, setSelectedSceneId] = useState(document.scenes[0].id);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(document.scenes[0].layers[0]?.id ?? null);
  const [newLayerSourceId, setNewLayerSourceId] = useState(document.tvBoard.sources[0]?.id ?? "");
  const [status, setStatus] = useState("Scene designer ready. Changes affect the project draft only.");
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const draftRef = useRef(draft);
  const pastRef = useRef<StudioProjectDocumentV2[]>([]);
  const futureRef = useRef<StudioProjectDocumentV2[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const keyboardActionsRef = useRef<{
    undo(): void;
    redo(): void;
    deleteLayer(): void;
    nudge(x: number, y: number): void;
    canUndo: boolean;
    canRedo: boolean;
    canEditLayer: boolean;
  }>({
    undo() {},
    redo() {},
    deleteLayer() {},
    nudge() {},
    canUndo: false,
    canRedo: false,
    canEditLayer: false,
  });

  useEffect(() => {
    const parsed = studioProjectDocumentV2Schema.parse(document);
    draftRef.current = parsed;
    setDraft(parsed);
  }, [document]);

  const selectedScene = draft.scenes.find((scene) => scene.id === selectedSceneId) ?? draft.scenes[0];
  const effectiveSceneId = selectedScene.id;
  const selectedLayer = selectedScene.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const sourcesById = new Map(draft.tvBoard.sources.map((source) => [source.id, source]));
  const assetsById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const effectiveNewLayerSourceId = draft.tvBoard.sources.some((source) => source.id === newLayerSourceId)
    ? newLayerSourceId
    : draft.tvBoard.sources[0]?.id ?? "";
  const readyVisualAssets = mediaAssets.filter((asset) =>
    asset.status === "READY" && (asset.type === "VIDEO" || asset.type === "IMAGE"),
  );

  function checkpoint(): void {
    pastRef.current = [...pastRef.current, structuredClone(draftRef.current)].slice(-MAX_HISTORY);
    futureRef.current = [];
    setHistoryAvailability({ canUndo: true, canRedo: false });
  }

  function emit(next: StudioProjectDocumentV2, message: string, withCheckpoint = true): boolean {
    const result = studioProjectDocumentV2Schema.safeParse(next);
    if (!result.success) {
      setStatus(`Change rejected: ${result.error.issues[0]?.message ?? "invalid project document"}`);
      return false;
    }
    if (withCheckpoint) checkpoint();
    draftRef.current = result.data;
    setDraft(result.data);
    setStatus(message);
    onDocumentChange(result.data);
    return true;
  }

  function replaceScene(
    sceneId: string,
    change: (scene: StudioProjectDocumentV2["scenes"][number]) => StudioProjectDocumentV2["scenes"][number],
    message: string,
    withCheckpoint = true,
  ): boolean {
    const current = draftRef.current;
    return emit({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === sceneId ? change(scene) : scene),
    }, message, withCheckpoint);
  }

  function replaceLayer(
    sceneId: string,
    layerId: string,
    change: (layer: StudioTvSceneLayer) => StudioTvSceneLayer,
    message: string,
    withCheckpoint = true,
  ): boolean {
    return replaceScene(sceneId, (scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => layer.id === layerId ? change(layer) : layer),
    }), message, withCheckpoint);
  }

  function selectScene(sceneId: string): void {
    const scene = draftRef.current.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    setSelectedSceneId(sceneId);
    setSelectedLayerId(scene.layers[0]?.id ?? null);
    setStatus(`${scene.name} selected for design.`);
  }

  function createScene(): void {
    if (disabled || draftRef.current.scenes.length >= 256) return;
    const id = crypto.randomUUID();
    const name = nextSceneName(draftRef.current);
    const current = draftRef.current;
    if (emit({
      ...current,
      scenes: [...current.scenes, { id, name, layers: [], transition: "CUT", transitionMs: 0 }],
    }, `${name} created.`)) {
      setSelectedSceneId(id);
      setSelectedLayerId(null);
    }
  }

  function renameScene(sceneId: string, name: string): void {
    const trimmed = name.trim().slice(0, 80);
    const current = draftRef.current.scenes.find((scene) => scene.id === sceneId);
    if (!trimmed || !current || current.name === trimmed) return;
    replaceScene(sceneId, (scene) => ({ ...scene, name: trimmed }), `Scene renamed to ${trimmed}.`);
  }

  function duplicateScene(sceneId: string): void {
    const current = draftRef.current;
    if (disabled || current.scenes.length >= 256) return;
    const index = current.scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) return;
    const source = current.scenes[index];
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: duplicateName(source.name),
      layers: source.layers.map((layer) => ({ ...layer, id: crypto.randomUUID() })),
    };
    const scenes = [...current.scenes];
    scenes.splice(index + 1, 0, copy);
    if (emit({ ...current, scenes }, `${source.name} duplicated.`)) {
      setSelectedSceneId(copy.id);
      setSelectedLayerId(copy.layers[0]?.id ?? null);
    }
  }

  function moveScene(sceneId: string, direction: -1 | 1): void {
    const current = draftRef.current;
    const index = current.scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (disabled || index < 0 || target < 0 || target >= current.scenes.length) return;
    const scenes = [...current.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    emit({ ...current, scenes }, `${scenes[target].name} moved ${direction < 0 ? "up" : "down"}.`);
  }

  function deleteScene(sceneId: string): void {
    const current = draftRef.current;
    if (disabled || current.scenes.length <= 1) return;
    const scene = current.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    const next = deleteSceneFromDocument(current, sceneId);
    if (emit(next, `${scene.name} deleted. Initial buses were reassigned if needed.`)) {
      const replacement = next.scenes[Math.min(current.scenes.indexOf(scene), next.scenes.length - 1)];
      setSelectedSceneId(replacement.id);
      setSelectedLayerId(replacement.layers[0]?.id ?? null);
    }
  }

  function addSingletonSource(kind: (typeof SINGLETON_SOURCE_KINDS)[number]): void {
    const current = draftRef.current;
    if (disabled || current.tvBoard.sources.length >= 256 || current.tvBoard.sources.some((source) => source.kind === kind)) return;
    const names = { BLACK: "Black" } as const;
    const source: StudioTvSource = { id: crypto.randomUUID(), name: names[kind], kind };
    emit({
      ...current,
      tvBoard: { ...current.tvBoard, sources: [...current.tvBoard.sources, source] },
    }, `${names[kind]} source added.`);
    setNewLayerSourceId(source.id);
  }

  function addColorSource(): void {
    const current = draftRef.current;
    if (disabled || current.tvBoard.sources.length >= 256) return;
    const source: StudioTvSource = {
      id: crypto.randomUUID(),
      name: `Color ${current.tvBoard.sources.filter((candidate) => candidate.kind === "COLOR").length + 1}`,
      kind: "COLOR",
      color: "#315f78",
    };
    emit({
      ...current,
      tvBoard: { ...current.tvBoard, sources: [...current.tvBoard.sources, source] },
    }, `${source.name} added.`);
    setNewLayerSourceId(source.id);
  }

  function addMediaSource(asset: MediaAssetSummary): void {
    const current = draftRef.current;
    if (
      disabled
      || current.tvBoard.sources.length >= 256
      || asset.status !== "READY"
      || (asset.type !== "VIDEO" && asset.type !== "IMAGE")
      || current.tvBoard.sources.some((source) => source.kind === "MEDIA" && source.assetId === asset.id)
    ) return;
    const source: StudioTvSource = {
      id: crypto.randomUUID(),
      name: asset.title.trim().slice(0, 80) || `${asset.type === "IMAGE" ? "Image" : "Video"} source`,
      kind: "MEDIA",
      mediaType: asset.type,
      assetId: asset.id,
    };
    emit({
      ...current,
      tvBoard: { ...current.tvBoard, sources: [...current.tvBoard.sources, source] },
    }, `${source.name} added as a library source.`);
    setNewLayerSourceId(source.id);
  }

  function renameSource(sourceId: string, name: string): void {
    const trimmed = name.trim().slice(0, 80);
    const current = draftRef.current;
    const source = current.tvBoard.sources.find((candidate) => candidate.id === sourceId);
    if (!trimmed || !source || source.name === trimmed) return;
    emit({
      ...current,
      tvBoard: {
        ...current.tvBoard,
        sources: current.tvBoard.sources.map((candidate) => candidate.id === sourceId
          ? { ...candidate, name: trimmed }
          : candidate),
      },
    }, `Source renamed to ${trimmed}.`);
  }

  function updateColorSource(sourceId: string, color: string): void {
    const current = draftRef.current;
    emit({
      ...current,
      tvBoard: {
        ...current.tvBoard,
        sources: current.tvBoard.sources.map((source) => source.id === sourceId && source.kind === "COLOR"
          ? { ...source, color }
          : source),
      },
    }, `Color source changed to ${color.toUpperCase()}.`);
  }

  function deleteSource(sourceId: string): void {
    const current = draftRef.current;
    if (disabled) return;
    const source = current.tvBoard.sources.find((candidate) => candidate.id === sourceId);
    if (!source) return;
    const references = current.scenes.reduce(
      (count, scene) => count + scene.layers.filter((layer) => layer.sourceId === sourceId).length,
      0,
    );
    if (references > 0 && !window.confirm(
      `${source.name} is used by ${references} layer${references === 1 ? "" : "s"}. Delete the source and remove those layers from every scene?`,
    )) return;
    const next = deleteSourceFromDocument(current, sourceId);
    if (emit(next, `${source.name} deleted${references ? ` with ${references} referenced layer${references === 1 ? "" : "s"}` : ""}.`)) {
      if (selectedLayer && selectedLayer.sourceId === sourceId) setSelectedLayerId(null);
      if (newLayerSourceId === sourceId) setNewLayerSourceId(next.tvBoard.sources[0]?.id ?? "");
    }
  }

  function addLayer(): void {
    const current = draftRef.current;
    const scene = current.scenes.find((candidate) => candidate.id === effectiveSceneId);
    const source = current.tvBoard.sources.find((candidate) => candidate.id === effectiveNewLayerSourceId);
    if (disabled || !scene || !source || scene.layers.length >= 64) return;
    const layer: StudioTvSceneLayer = {
      id: crypto.randomUUID(),
      sourceId: source.id,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      fit: source.kind === "BLACK" || source.kind === "COLOR" ? "FILL" : "COVER",
      opacity: 1,
      z: scene.layers.reduce((highest, candidate) => Math.max(highest, candidate.z), -1) + 1,
      visible: true,
      locked: false,
    };
    if (replaceScene(scene.id, (candidate) => ({ ...candidate, layers: [...candidate.layers, layer] }), `${source.name} layer added.`)) {
      setSelectedLayerId(layer.id);
    }
  }

  function duplicateLayer(layerId: string): void {
    const current = draftRef.current;
    const scene = current.scenes.find((candidate) => candidate.id === effectiveSceneId);
    const layer = scene?.layers.find((candidate) => candidate.id === layerId);
    if (disabled || !scene || !layer || scene.layers.length >= 64) return;
    const offset = 1 / current.tvBoard.editor.gridSize;
    const copy: StudioTvSceneLayer = {
      ...layer,
      id: crypto.randomUUID(),
      rect: clampNormalizedRect({ ...layer.rect, x: layer.rect.x + offset, y: layer.rect.y + offset }),
      z: scene.layers.reduce((highest, candidate) => Math.max(highest, candidate.z), -1) + 1,
      locked: false,
    };
    if (replaceScene(scene.id, (candidate) => ({ ...candidate, layers: [...candidate.layers, copy] }), "Layer duplicated.")) {
      setSelectedLayerId(copy.id);
    }
  }

  function deleteLayer(layerId = selectedLayerId): void {
    const current = draftRef.current;
    const scene = current.scenes.find((candidate) => candidate.id === effectiveSceneId);
    const layer = scene?.layers.find((candidate) => candidate.id === layerId);
    if (disabled || !scene || !layer || layer.locked) return;
    if (replaceScene(scene.id, (candidate) => ({
      ...candidate,
      layers: candidate.layers.filter((item) => item.id !== layer.id),
    }), "Layer deleted.")) setSelectedLayerId(null);
  }

  function moveLayerZ(layerId: string, direction: -1 | 1): void {
    const current = draftRef.current;
    const scene = current.scenes.find((candidate) => candidate.id === effectiveSceneId);
    const layer = scene?.layers.find((candidate) => candidate.id === layerId);
    if (disabled || !scene || !layer || layer.locked) return;
    const ordered = scene.layers.map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => left.candidate.z - right.candidate.z || left.index - right.index)
      .map(({ candidate }) => candidate);
    const index = ordered.findIndex((candidate) => candidate.id === layerId);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const zById = new Map(ordered.map((candidate, z) => [candidate.id, z]));
    replaceScene(scene.id, (candidate) => ({
      ...candidate,
      layers: candidate.layers.map((item) => ({ ...item, z: zById.get(item.id) ?? item.z })),
    }), `Layer moved ${direction > 0 ? "forward" : "backward"}.`);
  }

  function nudgeLayer(deltaX: number, deltaY: number): void {
    const layer = draftRef.current.scenes
      .find((scene) => scene.id === effectiveSceneId)?.layers
      .find((candidate) => candidate.id === selectedLayerId);
    if (disabled || !layer || layer.locked) return;
    replaceLayer(effectiveSceneId, layer.id, (candidate) => ({
      ...candidate,
      rect: transformNormalizedRect(candidate.rect, "MOVE", deltaX, deltaY, { snapToGrid: false, gridSize: 8 }),
    }), "Layer nudged.");
  }

  function undo(): void {
    if (disabled) return;
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, structuredClone(draftRef.current)].slice(-MAX_HISTORY);
    setHistoryAvailability({ canUndo: pastRef.current.length > 0, canRedo: true });
    emit(previous, "Undid the last designer change.", false);
  }

  function redo(): void {
    if (disabled) return;
    const next = futureRef.current.at(-1);
    if (!next) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, structuredClone(draftRef.current)].slice(-MAX_HISTORY);
    setHistoryAvailability({ canUndo: true, canRedo: futureRef.current.length > 0 });
    emit(next, "Redid the last designer change.", false);
  }

  useEffect(() => {
    keyboardActionsRef.current = {
      undo,
      redo,
      deleteLayer,
      nudge: nudgeLayer,
      canUndo: !disabled && historyAvailability.canUndo,
      canRedo: !disabled && historyAvailability.canRedo,
      canEditLayer: !disabled && Boolean(selectedLayer && !selectedLayer.locked),
    };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return;
      const actions = keyboardActionsRef.current;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const canChangeHistory = event.shiftKey ? actions.canRedo : actions.canUndo;
        if (!canChangeHistory) return;
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        if (!actions.canRedo) return;
        event.preventDefault();
        actions.redo();
        return;
      }
      if (event.key === "Delete") {
        if (!actions.canEditLayer) return;
        event.preventDefault();
        actions.deleteLayer();
        return;
      }
      const distance = event.shiftKey ? 0.01 : 0.001;
      const delta = event.key === "ArrowLeft" ? [-distance, 0]
        : event.key === "ArrowRight" ? [distance, 0]
          : event.key === "ArrowUp" ? [0, -distance]
            : event.key === "ArrowDown" ? [0, distance]
              : null;
      if (!delta || !actions.canEditLayer) return;
      event.preventDefault();
      actions.nudge(delta[0], delta[1]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function beginCanvasPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target as Element;
    const layerElement = target.closest<HTMLElement>("[data-layer-id]");
    if (!layerElement) {
      setSelectedLayerId(null);
      return;
    }
    const layerId = layerElement.dataset.layerId;
    const layer = selectedScene.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    setSelectedLayerId(layer.id);
    if (disabled || layer.locked) {
      setStatus(layer.locked ? "Layer selected. Unlock it before moving or resizing." : "Designer editing is disabled.");
      return;
    }
    event.preventDefault();
    const handle = target.closest<HTMLElement>("[data-resize-handle]")?.dataset.resizeHandle as ResizeHandle | undefined;
    const canvasRect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      sceneId: selectedScene.id,
      layerId: layer.id,
      transform: handle ?? "MOVE",
      originX: event.clientX,
      originY: event.clientY,
      canvasWidth: Math.max(1, canvasRect.width),
      canvasHeight: Math.max(1, canvasRect.height),
      rect: layer.rect,
      historyStarted: false,
    };
  }

  function moveCanvasPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = transformNormalizedRect(
      drag.rect,
      drag.transform,
      (event.clientX - drag.originX) / drag.canvasWidth,
      (event.clientY - drag.originY) / drag.canvasHeight,
      draftRef.current.tvBoard.editor,
    );
    if (sameRect(rect, draftRef.current.scenes
      .find((scene) => scene.id === drag.sceneId)?.layers
      .find((layer) => layer.id === drag.layerId)?.rect ?? drag.rect)) return;
    if (!drag.historyStarted) {
      checkpoint();
      drag.historyStarted = true;
    }
    replaceLayer(drag.sceneId, drag.layerId, (layer) => ({ ...layer, rect }), "Layer geometry changed.", false);
  }

  function endCanvasPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (drag.historyStarted) setStatus(`Layer ${drag.transform === "MOVE" ? "moved" : "resized"}.`);
  }

  function updateRect(kind: "rect" | "crop", field: keyof NormalizedRect, rawValue: string): void {
    const value = Number(rawValue);
    if (!selectedLayer || !Number.isFinite(value) || selectedLayer.locked || disabled) return;
    replaceLayer(selectedScene.id, selectedLayer.id, (layer) => ({
      ...layer,
      [kind]: updateNormalizedRect(layer[kind], field, value),
    }), `${kind === "rect" ? "Layer geometry" : "Source crop"} changed.`);
  }

  function updateSceneSetting(
    change: Partial<Pick<StudioProjectDocumentV2["scenes"][number], "transition" | "transitionMs">>,
    message: string,
  ): void {
    replaceScene(selectedScene.id, (scene) => ({ ...scene, ...change }), message);
  }

  function updateBoard(
    change: Partial<StudioProjectDocumentV2["tvBoard"]>,
    message: string,
  ): void {
    const current = draftRef.current;
    emit({ ...current, tvBoard: { ...current.tvBoard, ...change } }, message);
  }

  function handleRenameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, original: string): void {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      event.currentTarget.value = original;
      event.currentTarget.blur();
    }
  }

  const orderedCanvasLayers = selectedScene.layers.map((layer, index) => ({ layer, index }))
    .sort((left, right) => left.layer.z - right.layer.z || left.index - right.index)
    .map(({ layer }) => layer);
  const topFirstLayers = [...orderedCanvasLayers].reverse();
  const canvasStyle = { "--tv-designer-grid-size": draft.tvBoard.editor.gridSize } as CSSProperties;

  return <section className="tv-designer" aria-labelledby={headingId} data-disabled={disabled ? "true" : undefined}>
    <header className="tv-designer__header">
      <div>
        <p className="tv-designer__kicker"><Layers3 size={15} aria-hidden="true" /> Scene composition</p>
        <h2 id={headingId}>TV Scene Designer</h2>
        <p>Build reusable draft layouts from generated colors and uploaded media.</p>
      </div>
      <div className="tv-designer__history" aria-label="Designer history">
        <button type="button" aria-label="Undo scene designer change" disabled={disabled || !historyAvailability.canUndo} onClick={undo}><Undo2 size={16} aria-hidden="true" /> Undo</button>
        <button type="button" aria-label="Redo scene designer change" disabled={disabled || !historyAvailability.canRedo} onClick={redo}><Redo2 size={16} aria-hidden="true" /> Redo</button>
      </div>
    </header>

    <p className="tv-designer__status" role="status" aria-live="polite">{status}</p>

    <div className="tv-designer__workspace">
      <aside className="tv-designer__rail" aria-label="Scenes and sources">
        <section className="tv-designer__panel" aria-labelledby={`${headingId}-scenes`}>
          <div className="tv-designer__panel-heading">
            <div><span>Scene bank</span><h3 id={`${headingId}-scenes`}>Scenes</h3></div>
            <button type="button" className="tv-designer__icon-button" aria-label="Create scene" disabled={disabled || draft.scenes.length >= 256} onClick={createScene}><Plus size={16} aria-hidden="true" /></button>
          </div>
          <div className="tv-designer__scene-list">
            {draft.scenes.map((scene, index) => {
              const isSelected = scene.id === selectedScene.id;
              const isPreview = scene.id === draft.tvBoard.initialPreviewSceneId;
              const isProgram = scene.id === draft.tvBoard.initialProgramSceneId;
              return <article className={`tv-designer__scene-row${isSelected ? " tv-designer__scene-row--selected" : ""}`} key={scene.id}>
                <button type="button" className="tv-designer__scene-select" aria-pressed={isSelected} onClick={() => selectScene(scene.id)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{scene.name}</strong>
                  <small>{scene.layers.length} layer{scene.layers.length === 1 ? "" : "s"}</small>
                  <i>{isProgram && <b>PGM</b>}{isPreview && <b>PVW</b>}</i>
                </button>
                <input
                  key={`${scene.id}:${scene.name}`}
                  aria-label={`Rename scene ${scene.name}`}
                  defaultValue={scene.name}
                  maxLength={80}
                  disabled={disabled}
                  onBlur={(event) => { renameScene(scene.id, event.currentTarget.value); if (!event.currentTarget.value.trim()) event.currentTarget.value = scene.name; }}
                  onKeyDown={(event) => handleRenameKeyDown(event, scene.name)}
                />
                <div className="tv-designer__row-actions">
                  <button type="button" aria-label={`Move ${scene.name} up`} disabled={disabled || index === 0} onClick={() => moveScene(scene.id, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Move ${scene.name} down`} disabled={disabled || index === draft.scenes.length - 1} onClick={() => moveScene(scene.id, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Duplicate ${scene.name}`} disabled={disabled || draft.scenes.length >= 256} onClick={() => duplicateScene(scene.id)}><Copy size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Delete ${scene.name}`} disabled={disabled || draft.scenes.length <= 1} onClick={() => deleteScene(scene.id)}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              </article>;
            })}
          </div>
        </section>

        <section className="tv-designer__panel" aria-labelledby={`${headingId}-sources`}>
          <div className="tv-designer__panel-heading"><div><span>Patch list</span><h3 id={`${headingId}-sources`}>Sources</h3></div><b>{draft.tvBoard.sources.length}/256</b></div>
          <div className="tv-designer__source-create" aria-label="Add generated or capture source">
            {SINGLETON_SOURCE_KINDS.map((kind) => <button
              type="button"
              key={kind}
              disabled={disabled || draft.tvBoard.sources.length >= 256 || draft.tvBoard.sources.some((source) => source.kind === kind)}
              onClick={() => addSingletonSource(kind)}
            ><Plus size={13} aria-hidden="true" /> Black</button>)}
            <button type="button" disabled={disabled || draft.tvBoard.sources.length >= 256} onClick={addColorSource}><Plus size={13} aria-hidden="true" /> Color</button>
          </div>
          <div className="tv-designer__source-list">
            {draft.tvBoard.sources.map((source) => {
              const references = draft.scenes.reduce((count, scene) => count + scene.layers.filter((layer) => layer.sourceId === source.id).length, 0);
              return <article className="tv-designer__source-row" key={source.id}>
                <span className="tv-designer__source-icon">{sourceIcon(source)}</span>
                <div>
                  <input
                    key={`${source.id}:${source.name}`}
                    aria-label={`Rename source ${source.name}`}
                    defaultValue={source.name}
                    maxLength={80}
                    disabled={disabled}
                    onBlur={(event) => { renameSource(source.id, event.currentTarget.value); if (!event.currentTarget.value.trim()) event.currentTarget.value = source.name; }}
                    onKeyDown={(event) => handleRenameKeyDown(event, source.name)}
                  />
                  <small><b>{sourceKindLabel(source)}</b> · {sourceDescription(source)}</small>
                </div>
                {source.kind === "COLOR" && <input type="color" aria-label={`Color for ${source.name}`} value={source.color} disabled={disabled} onChange={(event) => updateColorSource(source.id, event.target.value)} />}
                <button
                  type="button"
                  className="tv-designer__icon-button"
                  aria-label={`Delete source ${source.name}${references ? ` and its ${references} layers` : ""}`}
                  title={references ? "Requires confirmation and removes every referenced layer" : "Delete unreferenced source"}
                  disabled={disabled}
                  onClick={() => deleteSource(source.id)}
                ><Trash2 size={14} aria-hidden="true" /></button>
              </article>;
            })}
            {draft.tvBoard.sources.length === 0 && <p className="tv-designer__empty">No sources. Add a source before creating layers.</p>}
          </div>
        </section>
      </aside>

      <main className="tv-designer__stage-column">
        <section className="tv-designer__stage-panel" aria-labelledby={`${headingId}-canvas`}>
          <div className="tv-designer__stage-heading">
            <div><span>1280 × 720 · 16:9</span><h3 id={`${headingId}-canvas`}>{selectedScene.name}</h3></div>
            <div><Grid3X3 size={14} aria-hidden="true" /> Grid {draft.tvBoard.editor.gridSize} × {draft.tvBoard.editor.gridSize}</div>
          </div>
          <div
            className={`tv-designer__canvas${draft.tvBoard.editor.snapToGrid ? " tv-designer__canvas--grid" : ""}`}
            style={canvasStyle}
            aria-label={`${selectedScene.name} visual canvas`}
            onPointerDown={beginCanvasPointer}
            onPointerMove={moveCanvasPointer}
            onPointerUp={endCanvasPointer}
            onPointerCancel={endCanvasPointer}
          >
            <div className="tv-designer__alignment-guides" aria-hidden="true"><i /><i /></div>
            {draft.tvBoard.editor.showSafeAreas && <div className="tv-designer__safe-guides" aria-hidden="true"><i><span>Action safe</span></i><i><span>Title safe</span></i></div>}
            {orderedCanvasLayers.map((layer, canvasIndex) => {
              if (!layer.visible) return null;
              const source = sourcesById.get(layer.sourceId);
              if (!source) return null;
              const asset = source.kind === "MEDIA" ? assetsById.get(source.assetId) : null;
              const imageUrl = source.kind === "MEDIA" && source.mediaType === "IMAGE" ? asset?.preview?.url : null;
              const isSelected = layer.id === selectedLayer?.id;
              const layerStyle: CSSProperties = {
                left: `${layer.rect.x * 100}%`,
                top: `${layer.rect.y * 100}%`,
                width: `${layer.rect.width * 100}%`,
                height: `${layer.rect.height * 100}%`,
                opacity: layer.opacity,
                zIndex: canvasIndex + 10,
              };
              const mediaStyle: CSSProperties = source.kind === "COLOR"
                ? { background: source.color }
                : imageUrl
                  ? {
                    backgroundImage: `url(${JSON.stringify(imageUrl).slice(1, -1)})`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: layer.fit === "FILL" ? "100% 100%" : layer.fit.toLowerCase(),
                  }
                  : {};
              return <div
                key={layer.id}
                className={`tv-designer__canvas-layer tv-designer__canvas-layer--${source.kind.toLowerCase()}${isSelected ? " tv-designer__canvas-layer--selected" : ""}${layer.locked ? " tv-designer__canvas-layer--locked" : ""}`}
                style={layerStyle}
                data-layer-id={layer.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${source.name} layer${layer.locked ? ", locked" : ""}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedLayerId(layer.id);
                  }
                }}
              >
                <div className="tv-designer__layer-media" style={mediaStyle}>
                  {!imageUrl && source.kind !== "COLOR" && <span>{sourceIcon(source)}<strong>{source.name}</strong><small>{sourceDescription(source)}</small></span>}
                </div>
                <b className="tv-designer__layer-tag">{layer.locked && <Lock size={10} aria-hidden="true" />}{source.name}</b>
                {isSelected && !layer.locked && RESIZE_HANDLES.map((handle) => <i key={handle} className={`tv-designer__handle tv-designer__handle--${handle}`} data-resize-handle={handle} aria-hidden="true" />)}
              </div>;
            })}
            {orderedCanvasLayers.every((layer) => !layer.visible) && <div className="tv-designer__canvas-empty"><Layers3 size={28} aria-hidden="true" /><strong>No visible layers</strong><span>Add a source below or make a layer visible.</span></div>}
          </div>
          <p className="tv-designer__instructions">Drag an unlocked selected layer to move it. Use its eight handles to resize. Arrow keys nudge by 0.001; hold Shift for 0.01. Delete removes an unlocked selection. Undo: Ctrl/Cmd+Z.</p>
        </section>

        <section className="tv-designer__panel" aria-labelledby={`${headingId}-layers`}>
          <div className="tv-designer__panel-heading"><div><span>Front to back</span><h3 id={`${headingId}-layers`}>Layer stack</h3></div><b>{selectedScene.layers.length}/64</b></div>
          <div className="tv-designer__add-layer">
            <label>Source
              <select value={effectiveNewLayerSourceId} disabled={disabled || draft.tvBoard.sources.length === 0} onChange={(event) => setNewLayerSourceId(event.target.value)}>
                {draft.tvBoard.sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {sourceKindLabel(source)}</option>)}
              </select>
            </label>
            <button type="button" disabled={disabled || draft.tvBoard.sources.length === 0 || selectedScene.layers.length >= 64} onClick={addLayer}><Plus size={15} aria-hidden="true" /> Add layer</button>
          </div>
          <div className="tv-designer__layer-list">
            {topFirstLayers.map((layer, index) => {
              const source = sourcesById.get(layer.sourceId);
              const selected = layer.id === selectedLayer?.id;
              return <article className={`tv-designer__layer-row${selected ? " tv-designer__layer-row--selected" : ""}`} key={layer.id}>
                <button type="button" className="tv-designer__layer-select" aria-pressed={selected} onClick={() => setSelectedLayerId(layer.id)}>
                  <span>{source ? sourceIcon(source) : <Layers3 size={16} aria-hidden="true" />}</span>
                  <strong>{source?.name ?? "Missing source"}</strong>
                  <small>z {layer.z} · {Math.round(layer.opacity * 100)}%</small>
                </button>
                <div className="tv-designer__layer-actions">
                  <button type="button" aria-label={`${layer.visible ? "Hide" : "Show"} ${source?.name ?? "layer"}`} aria-pressed={layer.visible} disabled={disabled || layer.locked} onClick={() => replaceLayer(selectedScene.id, layer.id, (candidate) => ({ ...candidate, visible: !candidate.visible }), `Layer ${layer.visible ? "hidden" : "shown"}.`)}>{layer.visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}</button>
                  <button type="button" aria-label={`${layer.locked ? "Unlock" : "Lock"} ${source?.name ?? "layer"}`} aria-pressed={layer.locked} disabled={disabled} onClick={() => replaceLayer(selectedScene.id, layer.id, (candidate) => ({ ...candidate, locked: !candidate.locked }), `Layer ${layer.locked ? "unlocked" : "locked"}.`)}>{layer.locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}</button>
                  <button type="button" aria-label={`Move ${source?.name ?? "layer"} forward`} disabled={disabled || layer.locked || index === 0} onClick={() => moveLayerZ(layer.id, 1)}><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Move ${source?.name ?? "layer"} backward`} disabled={disabled || layer.locked || index === topFirstLayers.length - 1} onClick={() => moveLayerZ(layer.id, -1)}><ArrowDown size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Duplicate ${source?.name ?? "layer"}`} disabled={disabled || selectedScene.layers.length >= 64} onClick={() => duplicateLayer(layer.id)}><Copy size={14} aria-hidden="true" /></button>
                  <button type="button" aria-label={`Delete ${source?.name ?? "layer"}`} disabled={disabled || layer.locked} onClick={() => deleteLayer(layer.id)}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              </article>;
            })}
            {selectedScene.layers.length === 0 && <p className="tv-designer__empty">This scene has no layers. Choose a source and add one.</p>}
          </div>
        </section>
      </main>

      <aside className="tv-designer__inspector" aria-label="Scene and layer inspector">
        <section className="tv-designer__panel" aria-labelledby={`${headingId}-layer-inspector`}>
          <div className="tv-designer__panel-heading"><div><span>Selected object</span><h3 id={`${headingId}-layer-inspector`}>Layer inspector</h3></div>{selectedLayer && (selectedLayer.locked ? <Lock size={15} aria-label="Locked" /> : <Unlock size={15} aria-label="Unlocked" />)}</div>
          {!selectedLayer
            ? <p className="tv-designer__empty">Select a layer on the canvas or in the stack.</p>
            : <>
              <fieldset className="tv-designer__fieldset" disabled={disabled || selectedLayer.locked}>
                <legend>Geometry · normalized output</legend>
                <div className="tv-designer__number-grid">
                  {(["x", "y", "width", "height"] as const).map((field) => <label key={`rect-${selectedLayer.id}-${field}`}>{field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()}
                    <input key={`${selectedLayer.id}:rect:${field}:${selectedLayer.rect[field]}`} type="number" min="0" max="1" step="0.001" defaultValue={selectedLayer.rect[field]} onBlur={(event) => updateRect("rect", field, event.currentTarget.value)} />
                  </label>)}
                </div>
              </fieldset>
              <fieldset className="tv-designer__fieldset" disabled={disabled || selectedLayer.locked}>
                <legend>Source crop · normalized input</legend>
                <div className="tv-designer__number-grid">
                  {(["x", "y", "width", "height"] as const).map((field) => <label key={`crop-${selectedLayer.id}-${field}`}>{field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()}
                    <input key={`${selectedLayer.id}:crop:${field}:${selectedLayer.crop[field]}`} type="number" min="0" max="1" step="0.001" defaultValue={selectedLayer.crop[field]} onBlur={(event) => updateRect("crop", field, event.currentTarget.value)} />
                  </label>)}
                </div>
              </fieldset>
              <div className="tv-designer__field-grid">
                <label>Fit
                  <select value={selectedLayer.fit} disabled={disabled || selectedLayer.locked} onChange={(event) => replaceLayer(selectedScene.id, selectedLayer.id, (layer) => ({ ...layer, fit: event.target.value as StudioTvSceneLayer["fit"] }), "Layer fit changed.")}>
                    <option value="CONTAIN">Contain</option><option value="COVER">Cover</option><option value="FILL">Fill</option>
                  </select>
                </label>
                <label>Opacity
                  <input key={`${selectedLayer.id}:opacity:${selectedLayer.opacity}`} type="number" min="0" max="1" step="0.01" defaultValue={selectedLayer.opacity} disabled={disabled || selectedLayer.locked} onBlur={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (Number.isFinite(value)) replaceLayer(selectedScene.id, selectedLayer.id, (layer) => ({ ...layer, opacity: rounded(clamp(value, 0, 1)) }), "Layer opacity changed.");
                  }} />
                </label>
              </div>
              <div className="tv-designer__toggles">
                <label><input type="checkbox" checked={selectedLayer.visible} disabled={disabled || selectedLayer.locked} onChange={() => replaceLayer(selectedScene.id, selectedLayer.id, (layer) => ({ ...layer, visible: !layer.visible }), `Layer ${selectedLayer.visible ? "hidden" : "shown"}.`)} /> Visible</label>
                <label><input type="checkbox" checked={selectedLayer.locked} disabled={disabled} onChange={() => replaceLayer(selectedScene.id, selectedLayer.id, (layer) => ({ ...layer, locked: !layer.locked }), `Layer ${selectedLayer.locked ? "unlocked" : "locked"}.`)} /> Locked</label>
              </div>
              {selectedLayer.locked && <p className="tv-designer__locked-note">Unlock this layer to change geometry, crop, fit, opacity, visibility, order, or deletion.</p>}
            </>}
        </section>

        <section className="tv-designer__panel" aria-labelledby={`${headingId}-scene-settings`}>
          <div className="tv-designer__panel-heading"><div><span>Selected scene</span><h3 id={`${headingId}-scene-settings`}>Transition</h3></div></div>
          <div className="tv-designer__field-grid">
            <label>Kind
              <select value={selectedScene.transition} disabled={disabled} onChange={(event) => updateSceneSetting({ transition: event.target.value as StudioProjectDocumentV2["scenes"][number]["transition"] }, "Scene transition changed.")}>
                <option value="CUT">Cut</option><option value="DISSOLVE">Dissolve</option><option value="FADE_THROUGH_BLACK">Fade through black</option>
              </select>
            </label>
            <label>Duration (ms)
              <input key={`${selectedScene.id}:duration:${selectedScene.transitionMs}`} type="number" min="0" max="10000" step="10" defaultValue={selectedScene.transitionMs} disabled={disabled} onBlur={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value)) updateSceneSetting({ transitionMs: clamp(Math.round(value), 0, 10_000) }, "Scene transition duration changed.");
              }} />
            </label>
          </div>
        </section>

        <section className="tv-designer__panel" aria-labelledby={`${headingId}-board-settings`}>
          <div className="tv-designer__panel-heading"><div><span>Project defaults</span><h3 id={`${headingId}-board-settings`}>Board settings</h3></div></div>
          <label>Initial Preview scene
            <select value={draft.tvBoard.initialPreviewSceneId} disabled={disabled} onChange={(event) => updateBoard({ initialPreviewSceneId: event.target.value }, "Initial Preview scene changed.")}>{draft.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
          </label>
          <label>Initial Program scene
            <select value={draft.tvBoard.initialProgramSceneId} disabled={disabled} onChange={(event) => updateBoard({ initialProgramSceneId: event.target.value }, "Initial Program scene changed.")}>{draft.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select>
          </label>
          <div className="tv-designer__toggles tv-designer__toggles--stacked">
            <label><input type="checkbox" checked={draft.tvBoard.editor.showSafeAreas} disabled={disabled} onChange={() => updateBoard({ editor: { ...draftRef.current.tvBoard.editor, showSafeAreas: !draftRef.current.tvBoard.editor.showSafeAreas } }, "Safe-area guides changed.")} /> Show safe areas</label>
            <label><input type="checkbox" checked={draft.tvBoard.editor.snapToGrid} disabled={disabled} onChange={() => updateBoard({ editor: { ...draftRef.current.tvBoard.editor, snapToGrid: !draftRef.current.tvBoard.editor.snapToGrid } }, "Grid snapping changed.")} /> Snap to grid and guides</label>
          </div>
          <label>Grid divisions
            <input key={`grid:${draft.tvBoard.editor.gridSize}`} type="number" min="2" max="64" step="1" defaultValue={draft.tvBoard.editor.gridSize} disabled={disabled} onBlur={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) updateBoard({ editor: { ...draftRef.current.tvBoard.editor, gridSize: clamp(Math.round(value), 2, 64) } }, "Grid size changed.");
            }} />
          </label>
        </section>
      </aside>
    </div>

    <section className="tv-designer__library" aria-labelledby={`${headingId}-library`}>
      <div className="tv-designer__panel-heading">
        <div><span>Ready video and image assets</span><h3 id={`${headingId}-library`}>Media library</h3></div>
        <b>{readyVisualAssets.length} available</b>
      </div>
      <div className="tv-designer__media-grid">
        {readyVisualAssets.map((asset) => {
          const added = draft.tvBoard.sources.some((source) => source.kind === "MEDIA" && source.assetId === asset.id);
          return <article className="tv-designer__media-card" key={asset.id}>
            <div className="tv-designer__media-preview">
              {asset.type === "IMAGE" && asset.preview
                ? <div role="img" aria-label={`${asset.title} image preview`} style={{ backgroundImage: `url(${JSON.stringify(asset.preview.url).slice(1, -1)})` }} />
                : asset.type === "VIDEO"
                  ? <span><Video size={24} aria-hidden="true" /> Video asset</span>
                  : <span><ImageIcon size={24} aria-hidden="true" /> Image preview unavailable</span>}
              <b>{asset.type}</b>
            </div>
            <div><strong title={asset.title}>{asset.title}</strong><small>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Dimensions unavailable"}</small></div>
            <button type="button" disabled={disabled || added || draft.tvBoard.sources.length >= 256} onClick={() => addMediaSource(asset)}>{added ? "Added" : "Add source"}</button>
          </article>;
        })}
        {readyVisualAssets.length === 0 && <p className="tv-designer__empty">No ready video or image assets are available in the supplied library.</p>}
      </div>
    </section>
  </section>;
}
