import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import { registrationEnabled } from "@/lib/registration-policy";

export const metadata = { title: "Sign in" };
type Context = { searchParams: Promise<{ next?: string | string[] }> };
export default async function LoginPage({ searchParams }: Context) {
  const params = await searchParams;
  const raw = params.next;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const next = safeNextPath(candidate);
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/account/change-password" : next);
  return <main className="auth-page"><section className="card auth-card"><Brand /><AuthForm mode="login" next={next} registrationEnabled={registrationEnabled()} /></section></main>;
}
