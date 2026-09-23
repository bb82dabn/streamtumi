import Link from "next/link";
import { Brand } from "@/components/brand";
import { VerificationForm } from "./verification-form";

export const metadata = { title: "Verify email" };

type Context = { searchParams: Promise<{ token?: string | string[] }> };

export default async function VerifyEmailPage({ searchParams }: Context) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return (
    <main className="auth-page">
      <section className="card auth-card stack-lg">
        <Brand />
        <VerificationForm token={token ?? ""} />
        <Link href="/dashboard" className="button button-secondary">Return to StreamTumi</Link>
      </section>
    </main>
  );
}
