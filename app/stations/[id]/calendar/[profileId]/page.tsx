import { notFound } from "next/navigation";
import { Brand, RadioBrand } from "@/components/brand";
import { CalendarProgrammingEditor } from "@/components/calendar-programming-editor";
import { LogoutButton } from "@/components/logout-button";
import { StationSectionNav } from "@/components/station-section-nav";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar Programming", robots: { index: false, follow: false } };

type Context = { params: Promise<{ id: string; profileId: string }> };
type CalendarStation = {
  id: string;
  name: string;
  station_kind: "TV" | "RADIO";
  time_zone: string;
  profile_name: string;
  lifecycle: "DRAFT" | "ACTIVE";
};

export default async function CalendarProgrammingPage({ params }: Context) {
  const user = await requireUser();
  const { id, profileId } = await params;
  const result = await query<CalendarStation>(
    `SELECT station.id, station.name, station.station_kind, station.time_zone,
            profile.name AS profile_name, profile.lifecycle
       FROM stations station
       JOIN station_programming_profiles profile ON profile.station_id = station.id
      WHERE station.id = $1 AND station.owner_id = $2 AND station.deleted_at IS NULL
        AND profile.id = $3 AND profile.strategy = 'CALENDAR_EVENTS'
        AND profile.lifecycle IN ('DRAFT', 'ACTIVE')`,
    [id, user.id, profileId],
  );
  const station = result.rows[0];
  if (!station) notFound();

  return <>
    <header className="topbar"><div className="shell topbar-inner">{station.station_kind === "RADIO" ? <RadioBrand href="/dashboard?type=radio" /> : <Brand href="/dashboard" />}<nav className="nav-actions" aria-label="Calendar navigation"><a className="button button-quiet hide-mobile" href={`/stations/${station.id}/programming`}>Back to programming</a><a className="button button-quiet hide-mobile" href="/dashboard">All stations</a><LogoutButton /></nav></div></header>
    <main className="shell page station-management" data-station-section="programming">
      <div className="page-header"><div><p className="eyebrow">Calendar programming</p><h1>{station.profile_name}</h1><div className="cluster"><span className="status">{station.name}</span><span className={`status ${station.lifecycle === "ACTIVE" ? "status-success" : "status-warning"}`}>{station.lifecycle.toLowerCase()}</span><span className="meta">Times are authored in each event&apos;s IANA timezone.</span></div></div><a className="button button-secondary" href={`/stations/${station.id}/programming`}>Return to station</a></div>
      <StationSectionNav stationId={station.id} active="programming" />
      <CalendarProgrammingEditor stationId={station.id} profileId={profileId} stationKind={station.station_kind} stationTimeZone={station.time_zone} />
    </main>
  </>;
}
