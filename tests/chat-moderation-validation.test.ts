import { describe, expect, it } from "vitest";
import { chatMessageSchema, chatUsernameSchema, reportSchema } from "@/lib/validation";

describe("chat validation", () => {
  it("normalizes guest names and rejects reserved identities", () => {
    expect(chatUsernameSchema.parse("  River   Fan  ")).toBe("River Fan");
    expect(() => chatUsernameSchema.parse("Moderator")).toThrow();
    expect(() => chatUsernameSchema.parse("Host")).toThrow();
  });

  it("keeps line breaks but removes unsafe direction controls", () => {
    expect(chatMessageSchema.parse({ body: "hello\nworld\u202e" }).body).toBe("hello\nworld");
    expect(() => chatMessageSchema.parse({ body: " ".repeat(501) })).toThrow();
  });
});

describe("report validation", () => {
  it("requires a target for video and message reports", () => {
    const base = { reason: "ILLEGAL_CONTENT" as const, details: "Enough detail for review." };
    expect(() => reportSchema.parse({ ...base, subjectType: "VIDEO" })).toThrow();
    expect(() => reportSchema.parse({ ...base, subjectType: "CHAT_MESSAGE" })).toThrow();
    expect(reportSchema.parse({ ...base, subjectType: "STATION" }).subjectType).toBe("STATION");
  });
});
