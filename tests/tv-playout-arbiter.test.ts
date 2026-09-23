import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

describe("TV automation playout arbiter wiring", () => {
  let source: string;

  beforeAll(async () => {
    source = await readFile(new URL("../src-tv-playout.ts", import.meta.url), "utf8");
  });

  it("appends only local automation journal segments", () => {
    expect(source).toContain("appendTvJournalSegments(runtime.lease");
    expect(source).toContain("loadTvAutomationSnapshot");
    expect(source).not.toContain("Studio");
    expect(source).not.toContain("Packager");
  });

  it("releases the lease on station loss and shutdown", () => {
    expect(source).toContain("renewTvPlayoutLease");
    expect(source).toContain("await stopRuntime(runtime, false)");
    expect(source).toContain("runtime.lease.leaseUntil.getTime() - Date.now()");
    expect(source).toContain("Promise.allSettled([...runtimes.values()].map((runtime) => stopRuntime(runtime, true)))");
  });
});
