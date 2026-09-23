import { describe, expect, it } from "vitest";
import { adminRoleUpdateSchema } from "@/lib/validation";

describe("admin role request validation", () => {
  it("requires an optimistic account version with a valid role", () => {
    expect(adminRoleUpdateSchema.parse({ role: "MODERATOR", expectedVersion: 4 }))
      .toEqual({ role: "MODERATOR", expectedVersion: 4 });
    expect(() => adminRoleUpdateSchema.parse({ role: "ADMIN" })).toThrow();
  });
});
