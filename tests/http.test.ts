import { describe, expect, it, vi } from "vitest";
import { assertSameOrigin, HttpError } from "@/lib/http";

vi.mock("@/lib/env", () => ({
  env: () => ({ APP_URL: "https://channels.example.com", APP_ALLOWED_ORIGINS: "https://streamtumi.com, https://legacy.example.com" }),
}));

const internalUrl = "http://streamtumi-internal:3000/api/stations";

function requestWithOrigin(origin?: string): Request {
  return new Request(internalUrl, { headers: origin ? { origin } : undefined });
}

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected action to throw");
}

describe("assertSameOrigin", () => {
  it("accepts the public HTTPS origin for an internal HTTP request URL", () => {
    expect(() => assertSameOrigin(requestWithOrigin("https://channels.example.com"))).not.toThrow();
  });

  it("rejects internal, Radio, and allow-listed legacy origins", () => {
    expect(() => assertSameOrigin(requestWithOrigin("http://streamtumi-internal:3000"))).toThrow();
    expect(() => assertSameOrigin(requestWithOrigin("https://radio.streamtumi.com"))).toThrow();
    expect(() => assertSameOrigin(requestWithOrigin("https://legacy.example.com"))).toThrow();
  });

  it("retains requests without an Origin header", () => {
    expect(() => assertSameOrigin(requestWithOrigin())).not.toThrow();
  });

  it("rejects a hostile origin", () => {
    const error = captureError(() => assertSameOrigin(requestWithOrigin("https://hostile.example")));
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, code: "BAD_ORIGIN" });
  });
});
