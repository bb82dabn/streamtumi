import { beforeEach, describe, expect, it, vi } from "vitest";
import { mobileConfigSchema } from "@/packages/contracts/src";

const mocks = vi.hoisted(() => ({ registrationEnabled: true }));

vi.mock("@/lib/env", () => ({ env: () => ({ REGISTRATION_ENABLED: mocks.registrationEnabled }) }));

import { GET } from "@/app/api/mobile/v1/config/route";

describe("mobile registration capabilities", () => {
  beforeEach(() => {
    mocks.registrationEnabled = true;
  });

  it.each([true, false])("returns a contract-validated no-store capability when registration is %s", async (enabled) => {
    mocks.registrationEnabled = enabled;
    const response = GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mobileConfigSchema.parse(payload)).toEqual({ apiVersion: 1, registrationEnabled: enabled });
    expect(Object.keys(payload)).toEqual(["apiVersion", "registrationEnabled"]);
  });
});
