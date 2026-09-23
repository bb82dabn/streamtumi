import { describe, expect, it } from "vitest";
import { reorderByIds } from "@/lib/playlist";

describe("playlist ordering", () => {
  const items = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
  it("reorders all items deterministically", () => expect(reorderByIds(items, ["c", "a", "b"]).map((item) => item.id)).toEqual(["c", "a", "b"]));
  it("rejects missing, duplicate, or unknown items", () => {
    expect(() => reorderByIds(items, ["a", "a", "c"])).toThrow();
    expect(() => reorderByIds(items, ["a", "b"])).toThrow();
    expect(() => reorderByIds(items, ["a", "b", "x"])).toThrow();
  });
});
