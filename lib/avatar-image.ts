import sharp from "sharp";
import { HttpError } from "@/lib/http";
import { bucket, ensureBucket, removePrefix, storage } from "@/lib/storage";

export const maxAvatarUploadBytes = 5 * 1024 * 1024;
export const avatarSizes = [96, 256] as const;
export type AvatarSize = (typeof avatarSizes)[number];
export type AvatarVariants = { 96: Buffer; 256: Buffer };

const maxAvatarPixels = 16_000_000;
const avatarRevisionPattern = /^[A-Za-z0-9_-]{43}$/;
const allowedContentTypes = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function avatarUrl(revision: string, size: AvatarSize = 96): string {
  if (!avatarRevisionPattern.test(revision)) throw new Error("Invalid avatar revision.");
  return `/api/community/avatars/${revision}/${size}.jpg`;
}

export function avatarObjectKey(revision: string, size: AvatarSize): string {
  if (!avatarRevisionPattern.test(revision)) throw new Error("Invalid avatar revision.");
  return `community/avatars/${revision}/${size}.jpg`;
}

export function isAvatarRevision(value: string): boolean {
  return avatarRevisionPattern.test(value);
}

export async function readAvatarUpload(request: Request): Promise<{ body: Buffer; contentType: string }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!allowedContentTypes.has(contentType)) {
    throw new HttpError(415, "Choose a JPEG, PNG, or WebP avatar.", "INVALID_AVATAR_TYPE");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxAvatarUploadBytes) {
      throw new HttpError(413, "Avatar uploads cannot exceed 5 MiB.", "AVATAR_TOO_LARGE");
    }
  }
  if (!request.body) throw new HttpError(400, "Choose an avatar image to upload.", "EMPTY_AVATAR");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxAvatarUploadBytes) {
        await reader.cancel("Avatar upload exceeded its size limit.").catch(() => undefined);
        throw new HttpError(413, "Avatar uploads cannot exceed 5 MiB.", "AVATAR_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new HttpError(400, "Choose an avatar image to upload.", "EMPTY_AVATAR");
  return { body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total), contentType };
}

export async function createAvatarVariants(body: Buffer, contentType: string): Promise<AvatarVariants> {
  let metadata: { format?: string; pages?: number; width?: number; height?: number };
  try {
    metadata = await sharp(body, { animated: true, failOn: "error", limitInputPixels: maxAvatarPixels }).metadata();
  } catch {
    throw new HttpError(422, "The avatar image could not be decoded safely.", "INVALID_AVATAR_IMAGE");
  }

  const expectedFormat = allowedContentTypes.get(contentType);
  if (!expectedFormat || metadata.format !== expectedFormat) {
    throw new HttpError(415, "The avatar contents do not match its JPEG, PNG, or WebP content type.", "INVALID_AVATAR_TYPE");
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new HttpError(422, "Animated or multi-frame avatars are not supported.", "INVALID_AVATAR_IMAGE");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 128 || height < 128 || width > 4096 || height > 4096 || width * height > maxAvatarPixels) {
    throw new HttpError(422, "Avatars must be 128-4096 pixels per side and no more than 16 megapixels.", "INVALID_AVATAR_DIMENSIONS");
  }

  try {
    const oriented = sharp(body, { failOn: "error", limitInputPixels: maxAvatarPixels }).autoOrient();
    const [small, large] = await Promise.all(avatarSizes.map((size) => oriented.clone()
      .resize(size, size, { fit: "cover", position: "centre" })
      .flatten({ background: { r: 20, g: 26, b: 30 } })
      .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
      .toBuffer()));
    return { 96: small, 256: large };
  } catch {
    throw new HttpError(422, "The avatar image could not be processed safely.", "INVALID_AVATAR_IMAGE");
  }
}

export async function storeAvatarVariants(revision: string, variants: AvatarVariants): Promise<void> {
  const prefix = `community/avatars/${revision}/`;
  await ensureBucket();
  try {
    await Promise.all(avatarSizes.map((size) => storage.putObject(
      bucket,
      avatarObjectKey(revision, size),
      variants[size],
      variants[size].byteLength,
      { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
    )));
  } catch (error) {
    await removePrefix(prefix).catch(() => undefined);
    throw error;
  }
}

export function removeAvatarRevision(revision: string): Promise<number> {
  if (!avatarRevisionPattern.test(revision)) return Promise.resolve(0);
  return removePrefix(`community/avatars/${revision}/`);
}

export async function removeOrphanedAvatarObjects(activeRevisions: ReadonlySet<string>, now = Date.now()): Promise<number> {
  const newestObjectByRevision = new Map<string, number>();
  for await (const item of storage.listObjectsV2(bucket, "community/avatars/", true)) {
    const match = /^community\/avatars\/([A-Za-z0-9_-]{43})\/(?:96|256)\.jpg$/.exec(item.name ?? "");
    if (!match || !item.lastModified) continue;
    const revision = match[1];
    newestObjectByRevision.set(revision, Math.max(newestObjectByRevision.get(revision) ?? 0, item.lastModified.getTime()));
  }

  const cutoff = now - 24 * 60 * 60 * 1000;
  const orphaned = [...newestObjectByRevision]
    .filter(([revision, modifiedAt]) => !activeRevisions.has(revision) && modifiedAt < cutoff)
    .slice(0, 100);
  let removed = 0;
  for (const [revision] of orphaned) removed += await removeAvatarRevision(revision);
  return removed;
}
