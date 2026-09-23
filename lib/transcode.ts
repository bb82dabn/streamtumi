export type Rendition = {
  name: "360p" | "720p" | "1080p";
  width: number;
  height: number;
  bitrate: string;
  bandwidth: number;
};

export const TRANSCODE_RENDITIONS: Rendition[] = [
  { name: "360p", width: 640, height: 360, bitrate: "800k", bandwidth: 928000 },
  { name: "720p", width: 1280, height: 720, bitrate: "2500k", bandwidth: 2692000 },
  { name: "1080p", width: 1920, height: 1080, bitrate: "5000k", bandwidth: 5192000 },
];

export function displayDimensions(width: number, height: number, rotation = 0): { width: number; height: number } {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: height, height: width } : { width, height };
}

export function renditionsForSource(width: number, height: number, rotation = 0): Rendition[] {
  const source = displayDimensions(width, height, rotation);
  return TRANSCODE_RENDITIONS.filter((rendition, index) => {
    if (index === 0) return true;
    const scale = Math.min(rendition.width / source.width, rendition.height / source.height);
    return scale <= 1;
  });
}

export function parseFrameRate(value?: string): number {
  if (!value) return 30;
  const [numerator, denominator = 1] = value.split("/").map(Number);
  const rate = denominator ? numerator / denominator : numerator;
  if (!Number.isFinite(rate) || rate <= 0) return 30;
  return Math.min(30, rate);
}
