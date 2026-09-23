import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WatchExperience } from "@/components/watch-experience";
import { HttpError } from "@/lib/http";
import { stationByToken } from "@/lib/public-access";

export const metadata: Metadata = { title: "Private station", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

export default async function WatchPage({ params }: Context) {
  const { token } = await params;
  try {
    await stationByToken(token, false);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return <WatchExperience token={token} />;
}
