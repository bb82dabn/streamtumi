import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymizeUserIfEligible } from "@/lib/admin-user-maintenance";

const client = { query: vi.fn() };
const requestedAt = new Date("2026-08-01T00:00:00.000Z");
const anonymizeAfter = new Date("2026-08-08T00:00:00.000Z");

describe("deleted user anonymization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing until timing and station-removal conditions are satisfied", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(anonymizeUserIfEligible(client as never, "user-1")).resolves.toBe(false);

    expect(client.query.mock.calls[1][0]).toMatch(/anonymize_after <= now\(\)/);
    expect(client.query.mock.calls[1][0]).toMatch(/NOT EXISTS \(SELECT 1 FROM stations/);
    expect(client.query.mock.calls[2][0]).toBe("ROLLBACK");
  });

  it("replaces identity and credentials, clears preferences and engagement, then audits", async () => {
    const removeAvatar = vi.fn().mockResolvedValue(2);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "user-1", email: "owner@example.com", avatar_revision: "R".repeat(43), deletion_requested_at: requestedAt, anonymize_after: anonymizeAfter }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(anonymizeUserIfEligible(client as never, "user-1", removeAvatar)).resolves.toBe(true);

    expect(client.query.mock.calls[2][0]).toMatch(/DELETE FROM sessions/);
    expect(client.query.mock.calls[3][0]).toMatch(/DELETE FROM mobile_refresh_tokens/);
    expect(client.query.mock.calls[4][0]).toMatch(/DELETE FROM password_reset_tokens/);
    expect(client.query.mock.calls[5][0]).toMatch(/DELETE FROM email_verification_tokens/);
    expect(client.query.mock.calls[6][0]).toMatch(/moderation_service_tokens/);
    expect(client.query.mock.calls[7][0]).toMatch(/DELETE FROM station_fans/);
    expect(client.query.mock.calls[8][0]).toMatch(/DELETE FROM station_ratings/);
    expect(client.query.mock.calls[9][0]).toMatch(/DELETE FROM station_tunes/);
    expect(client.query.mock.calls[10][0]).toMatch(/DELETE FROM user_blocks/);
    const update = String(client.query.mock.calls[11][0]);
    expect(update).toMatch(/email = 'deleted-'/);
    expect(update).toMatch(/display_name = 'Deleted user'/);
    expect(update).toMatch(/role = 'USER'/);
    expect(update).toMatch(/avatar_revision = NULL/);
    expect(update).toMatch(/weather_zip_code = NULL/);
    expect(update).toMatch(/show_explicit_content = false/);
    expect(update).toMatch(/crypt\(/);
    expect(client.query.mock.calls[12][0]).toMatch(/USER_ANONYMIZED/);
    expect(client.query.mock.calls[13][0]).toBe("COMMIT");
    expect(removeAvatar).toHaveBeenCalledWith("R".repeat(43));
  });
});
