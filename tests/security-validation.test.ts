import { describe, expect, it } from "vitest";
import { hashToken, randomToken, tokenMatchesHash } from "@/lib/crypto";
import { validateAudioUpload, validateUpload } from "@/lib/validation";

describe("private viewer tokens", () => {
  it("revokes the old link after regeneration", () => {
    const oldToken = randomToken();
    const newToken = randomToken();
    const persistedHash = hashToken(newToken);
    expect(tokenMatchesHash(oldToken, persistedHash)).toBe(false);
    expect(tokenMatchesHash(newToken, persistedHash)).toBe(true);
  });
});

describe("Radio audio validation", () => {
  it.each([
    ["track.mp3", "audio/mpeg"],
    ["track.m4a", "audio/mp4"],
    ["track.aac", "audio/aac"],
    ["track.wav", "audio/wav"],
    ["track.flac", "audio/flac"],
  ])("accepts %s", (filename, mime) => expect(validateAudioUpload(filename, mime, 100, 1_000)).toBeNull());

  it("rejects mismatched, empty, and oversized audio", () => {
    expect(validateAudioUpload("track.exe", "audio/mpeg", 100, 1_000)).toMatch(/Supported/);
    expect(validateAudioUpload("track.mp3", "video/mp4", 100, 1_000)).toMatch(/Supported/);
    expect(validateAudioUpload("track.mp3", "audio/mpeg", 0, 1_000)).toMatch(/empty/);
    expect(validateAudioUpload("track.flac", "audio/flac", 1_001, 1_000)).toMatch(/exceeds/);
  });
});

describe("upload validation", () => {
  it("accepts supported videos within the configured limit", () => expect(validateUpload("show.mp4", "video/mp4", 100, 1_000)).toBeNull());
  it("rejects deceptive extensions, unsupported MIME types, empty files, and oversized files", () => {
    expect(validateUpload("show.exe", "video/mp4", 100, 1_000)).toMatch(/Supported/);
    expect(validateUpload("show.mp4", "text/plain", 100, 1_000)).toMatch(/Supported/);
    expect(validateUpload("show.mp4", "video/mp4", 0, 1_000)).toMatch(/empty/);
    expect(validateUpload("show.mp4", "video/mp4", 1_001, 1_000)).toMatch(/exceeds/);
  });
});
