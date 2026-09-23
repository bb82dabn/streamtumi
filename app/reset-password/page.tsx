import { Brand } from "@/components/brand";
import { PasswordResetForm } from "@/components/password-reset-form";

export const metadata = { title: "Choose a new password" };
type Context = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ResetPasswordPage({ searchParams }: Context) {
  const rawToken = (await searchParams).token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  return <main className="auth-page"><section className="card auth-card"><Brand /><PasswordResetForm token={token ?? ""} /></section></main>;
}
