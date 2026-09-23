import { redirect } from "next/navigation";

export const metadata = { title: "Create Radio account", robots: { index: false, follow: false } };
type Context = { searchParams: Promise<{ next?: string | string[] }> };

export default async function RadioRegisterPage({ searchParams }: Context) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  redirect(next ? `/register?next=${encodeURIComponent(next)}` : "/register");
}
