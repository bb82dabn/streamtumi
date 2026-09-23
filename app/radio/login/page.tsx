import { redirect } from "next/navigation";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };
type Context = { searchParams: Promise<{ next?: string | string[] }> };

export default async function RadioLoginPage({ searchParams }: Context) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
