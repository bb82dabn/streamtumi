import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth-redirect";
import { registrationDisabledMessage, registrationEnabled } from "@/lib/registration-policy";

export const metadata = { title: "Create account" };
type Context = { searchParams: Promise<{ next?: string | string[] }> };
export default async function RegisterPage({ searchParams }: Context) {
  const params = await searchParams;
  const raw = params.next;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const next = safeNextPath(candidate);
  if (await currentUser()) redirect(next);
  if (!registrationEnabled()) {
    return <main className="auth-page"><section className="card auth-card stack-lg"><Brand /><div><h1>Registration unavailable</h1><p className="meta">{registrationDisabledMessage}</p></div><Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></section></main>;
  }
  return <main className="auth-page"><section className="card auth-card"><Brand /><AuthForm mode="register" next={next} /></section></main>;
}
