import { describe, expect, it } from "vitest";
import { canManageResource } from "@/lib/authorization";

describe("owner authorization rules", () => {
  it("allows the owner and denies other or unauthenticated users", () => {
    expect(canManageResource("owner-a", "owner-a")).toBe(true);
    expect(canManageResource("owner-b", "owner-a")).toBe(false);
    expect(canManageResource(null, "owner-a")).toBe(false);
  });
});
