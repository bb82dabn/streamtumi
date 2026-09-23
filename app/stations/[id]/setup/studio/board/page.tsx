import { notFound } from "next/navigation";
import { StudioProductionConsole } from "@/components/studio-production-console";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { studioOverview } from "@/lib/studio";

export const dynamic = "force-dynamic";
export const metadata = { title: "StreamTumi Studio Setup — Radio Board", robots: { index: false, follow: false } };
type Context = { params: Promise<{ id: string }> };

export default async function StudioBoardSetupPage({ params }: Context) {
  const user = await requireUser();
  const { id } = await params;
  const station = await query<{ station_kind: "TV" | "RADIO" }>("SELECT station_kind FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL", [id, user.id]);
  if (!station.rows[0] || station.rows[0].station_kind !== "RADIO") notFound();
  let overview;
  try {
    overview = await studioOverview(id, user.id, "RADIO");
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return <StudioProductionConsole initialOverview={overview} />;
}
