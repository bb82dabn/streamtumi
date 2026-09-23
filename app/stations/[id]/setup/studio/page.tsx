import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export default async function StudioSetupPage({ params }: Context) {
  const user = await requireUser();
  const { id } = await params;
  const station = await query<{ station_kind: "TV" | "RADIO" }>("SELECT station_kind FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL", [id, user.id]);
  if (!station.rows[0]) notFound();
  redirect(`/stations/${id}/setup/studio/${station.rows[0].station_kind === "TV" ? "scenes" : "board"}`);
}
