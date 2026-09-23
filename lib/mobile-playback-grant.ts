import { createHmac, randomBytes } from "node:crypto";
import { hashToken, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

const maxGrantTtlSeconds = 2 * 60 * 60;
const grantPattern = /^(\d{1,10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

function signature(expiresAtSeconds: number, nonce: string, token: string, stationId: string, accessGeneration: string): string {
  return createHmac("sha256", env().APP_SECRET)
    .update(`native-station-playback:v2:${expiresAtSeconds}:${nonce}:${hashToken(token)}:${stationId}:${accessGeneration}`)
    .digest("base64url");
}

export function issueMobilePlaybackGrant(
  token: string,
  stationId: string,
  nowMs = Date.now(),
  ttlSeconds = maxGrantTtlSeconds,
  accessGeneration = "legacy",
): { grant: string; expiresAt: Date } {
  const boundedTtl = Math.min(maxGrantTtlSeconds, Math.max(1, Math.floor(ttlSeconds)));
  const expiresAtSeconds = Math.floor(nowMs / 1000) + boundedTtl;
  const nonce = randomBytes(16).toString("base64url");
  const grant = `${expiresAtSeconds}.${nonce}.${signature(expiresAtSeconds, nonce, token, stationId, accessGeneration)}`;
  return { grant, expiresAt: new Date(expiresAtSeconds * 1000) };
}

export function validateMobilePlaybackGrant(
  grant: string,
  token: string,
  stationId: string,
  nowMs = Date.now(),
  accessGeneration = "legacy",
): boolean {
  const match = grantPattern.exec(grant);
  if (!match) return false;
  const expiresAtSeconds = Number(match[1]);
  const expected = signature(expiresAtSeconds, match[2], token, stationId, accessGeneration);
  if (!safeEqual(match[3], expected)) return false;
  return expiresAtSeconds > Math.floor(nowMs / 1000);
}

export function mobilePlaybackGrantFromRequest(
  request: Request,
  token: string,
  stationId: string,
  nowMs = Date.now(),
  accessGeneration = "legacy",
): string | null {
  const grants = new URL(request.url).searchParams.getAll("grant");
  if (grants.length !== 1) return null;
  return validateMobilePlaybackGrant(grants[0], token, stationId, nowMs, accessGeneration) ? grants[0] : null;
}

export function withMobilePlaybackGrant(uri: string, grant: string): string {
  const hashIndex = uri.indexOf("#");
  const beforeHash = hashIndex === -1 ? uri : uri.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : uri.slice(hashIndex);
  const separator = beforeHash.includes("?")
    ? beforeHash.endsWith("?") || beforeHash.endsWith("&") ? "" : "&"
    : "?";
  return `${beforeHash}${separator}grant=${encodeURIComponent(grant)}${fragment}`;
}
