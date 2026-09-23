import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { RadioStationControl } from "@/components/radio-station-control";
import { StationEditor } from "@/components/station-editor";
import type { StationSection } from "@/components/station-section-nav";
import { query } from "@/lib/db";

export async function StationSectionPage({ id, ownerId, section }: { id: string; ownerId: string; section: StationSection }) {
  const exists = await query<{ station_kind: "TV" | "RADIO"; playback_type: "conventional" | "WEATHERSTAR_4000" }>("SELECT station_kind, COALESCE(playback_type, 'conventional') AS playback_type FROM stations WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL AND COALESCE(playback_type, 'conventional') NOT IN ('STREAMTUMI_GUIDE', 'SPORTSSTAR')", [id, ownerId]);
  if (!exists.rows[0]) notFound();
  if (exists.rows[0].station_kind === "RADIO") return <RadioStationControl stationId={id} ownerId={ownerId} section={section} />;
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Brand href="/dashboard" /><nav className="nav-actions"><a className="button button-quiet hide-mobile" href="/dashboard">All stations</a><LogoutButton /></nav></div></header>
    <StationEditor stationId={id} section={section} />
  </>;
}
