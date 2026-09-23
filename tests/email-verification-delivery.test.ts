import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings: {
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL_FROM?: string;
} = {};
vi.mock("@/lib/env", () => ({ env: () => settings }));

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

import { deliverEmail, EmailDeliveryError } from "@/lib/email-delivery";

const rawToken = "S".repeat(43);
const message = {
  to: "listener@example.com",
  subject: "Verify your StreamTumi email",
  text: `https://streamtumi.com/verify-email?token=${rawToken}`,
  html: `<a href="https://streamtumi.com/verify-email?token=${rawToken}">Verify</a>`,
};

describe("email delivery adapter", () => {
  beforeEach(() => {
    delete settings.SMTP_HOST;
    delete settings.SMTP_PORT;
    delete settings.SMTP_SECURE;
    delete settings.SMTP_USER;
    delete settings.SMTP_PASSWORD;
    delete settings.EMAIL_FROM;
    sendMail.mockReset();
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs only a redacted notice outside production and fails without a provider", async () => {
    const notice = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(deliverEmail(message)).rejects.toBeInstanceOf(EmailDeliveryError);

    const logged = JSON.stringify(notice.mock.calls);
    expect(logged).toContain("l***@example.com");
    expect(logged).not.toContain("listener@example.com");
    expect(logged).not.toContain(rawToken);
  });

  it("uses SMTP authentication and sender settings without production logging", async () => {
    settings.SMTP_HOST = "mail.example.test";
    settings.SMTP_PORT = 465;
    settings.SMTP_SECURE = true;
    settings.SMTP_USER = "streamtumi";
    settings.SMTP_PASSWORD = "provider-secret";
    settings.EMAIL_FROM = "StreamTumi <no-reply@streamtumi.com>";
    vi.stubEnv("NODE_ENV", "production");
    const notice = vi.spyOn(console, "info").mockImplementation(() => undefined);
    sendMail.mockResolvedValue({ messageId: "message-1" });

    await expect(deliverEmail(message)).resolves.toBeUndefined();

    expect(notice).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: settings.EMAIL_FROM,
      to: message.to,
      text: message.text,
    }));
  });
});
