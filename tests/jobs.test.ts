import { describe, expect, it } from "vitest";
import { failedJobState } from "@/lib/jobs";

describe("failed transcoding recovery", () => {
  it("keeps retryable jobs queued and exposes final failures", () => {
    expect(failedJobState(1, 3)).toEqual({ status: "QUEUED", canRetry: true });
    expect(failedJobState(3, 3)).toEqual({ status: "FAILED", canRetry: false });
  });
});
