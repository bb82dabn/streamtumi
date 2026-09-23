import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

describe("playout supervisor station allocation", () => {
  let tvSource: string;
  let radioSource: string;

  beforeAll(async () => {
    [tvSource, radioSource] = await Promise.all([
      readFile(new URL("../src-tv-playout.ts", import.meta.url), "utf8"),
      readFile(new URL("../src-radio-playout.ts", import.meta.url), "utf8"),
    ]);
  });

  it.each([
    ["TV", () => tvSource, "tv_playout_leases"],
    ["Radio", () => radioSource, "radio_playout_leases"],
  ])("lets %s replicas select past stations leased by another replica", (_name, source, leaseTable) => {
    const contents = source();
    expect(contents).toContain(`LEFT JOIN ${leaseTable} active_lease`);
    expect(contents).toContain("active_lease.lease_until > clock_timestamp()");
    expect(contents).toContain("active_lease.station_id IS NULL OR active_lease.holder_id = $1::uuid");
    expect(contents).toContain("ORDER BY (active_lease.holder_id = $1::uuid) DESC");
    expect(contents).toMatch(/LIMIT \$2`[\s\S]*\[holderId, [^\]]+MAX_STATIONS|LIMIT \$2`[\s\S]*\[holderId, limit\]/);
  });
});
