import { env } from "@/lib/env";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery is temporarily unavailable.");
    this.name = "EmailDeliveryError";
  }
}

export function emailDeliveryConfigured(): boolean {
  const appEnv = env();
  return Boolean(appEnv.SMTP_HOST && appEnv.EMAIL_FROM);
}

function redactedAddress(address: string): string {
  const [local = "", domain = ""] = address.split("@", 2);
  return `${local.slice(0, 1) || "*"}***@${domain || "***"}`;
}

export async function deliverEmail(message: EmailMessage): Promise<void> {
  const appEnv = env();
  if (process.env.NODE_ENV !== "production") {
    console.info("Email delivery attempt", {
      recipient: redactedAddress(message.to),
      providerConfigured: emailDeliveryConfigured(),
    });
  }
  if (!appEnv.SMTP_HOST || !appEnv.EMAIL_FROM) throw new EmailDeliveryError();
  try {
    const transport = nodemailer.createTransport({
      host: appEnv.SMTP_HOST,
      port: appEnv.SMTP_PORT,
      secure: appEnv.SMTP_SECURE,
      ...(appEnv.SMTP_USER && appEnv.SMTP_PASSWORD
        ? { auth: { user: appEnv.SMTP_USER, pass: appEnv.SMTP_PASSWORD } }
        : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: appEnv.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch {
    throw new EmailDeliveryError();
  }
}
