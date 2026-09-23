import Link from "next/link";
import { Brand } from "@/components/brand";
import { CreateStation } from "@/components/create-station";
import { LogoutButton } from "@/components/logout-button";
import { StationDashboard } from "@/components/station-dashboard";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { viewerCounts } from "@/lib/presence";
import { listGenres } from "@/lib/genres";
import type { ProgrammingMode, StationKind } from "@/lib/station-kind";

export const metadata = { title: "Stations" };
export const dynamic = "force-dynamic";

type Station = {
  id: string;
  playback_type: "conventional" | "WEATHERSTAR_4000";
  station_kind: StationKind;
  programming_mode: ProgrammingMode;
  time_zone: string;
  name: string;
  description: string;
  mode: "ON_DEMAND" | "SYNCHRONIZED";
  access_enabled: boolean;
  broadcast_state: "RUNNING" | "STOPPED";
  ready_count: number;
  storage_bytes: string;
  updated_at: Date;
  purge_after: Date | null;
  visibility: "PRIVATE" | "PUBLIC";
  genre_name: string;
};

type Context = { searchParams: Promise<{ type?: string | string[] }> };

export default async function DashboardPage({ searchParams }: Context) {
  const user = await requireUser();
  const requestedType = (await searchParams).type;
  const type = requestedType === "tv" || requestedType === "radio" ? requestedType : "all";
  const [result, deleted, genres] = await Promise.all([query<Station>(
    `SELECT s.id, s.name, s.description, COALESCE(s.playback_type, 'conventional') AS playback_type,
              s.station_kind, s.programming_mode, s.time_zone, s.mode,
              s.access_enabled, s.broadcast_state, s.updated_at, s.purge_after, s.visibility, g.name AS genre_name,
              ((SELECT count(*) FROM videos v WHERE v.station_id = s.id AND v.status = 'READY')
                + (SELECT count(*) FROM radio_tracks t WHERE t.station_id = s.id AND t.status = 'READY'))::int AS ready_count,
              (SELECT quota_bytes::text FROM station_media_storage_usage_v WHERE station_id = s.id) AS storage_bytes
       FROM stations s
       JOIN station_genres g ON g.id = s.genre_id
       WHERE s.owner_id = $1 AND s.deleted_at IS NULL
       ORDER BY s.updated_at DESC`,
    [user.id],
  ), query<Station>(
    `SELECT s.id, s.name, s.description, COALESCE(s.playback_type, 'conventional') AS playback_type,
              s.station_kind, s.programming_mode, s.time_zone, s.mode,
              s.access_enabled, s.broadcast_state, s.updated_at, s.purge_after, s.visibility, g.name AS genre_name,
             0 AS ready_count, '0'::text AS storage_bytes
       FROM stations s
       JOIN station_genres g ON g.id = s.genre_id
       WHERE s.owner_id = $1 AND s.deleted_at IS NOT NULL
       ORDER BY s.deleted_at DESC`,
    [user.id],
  ), listGenres(true)]);
  const counts = await viewerCounts(result.rows.map((station) => station.id));
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Brand href="/dashboard" /><nav className="nav-actions"><Link className="button button-quiet" href="/guide">Guide</Link>{user.role === "ADMIN" ? <Link className="button button-quiet" href="/admin">Admin</Link> : user.role === "MODERATOR" ? <Link className="button button-quiet" href="/moderation">Moderation</Link> : null}<span className="meta hide-mobile">{user.displayName}</span><LogoutButton /></nav></div></header>
    <main className="shell page">
      <div className="page-header"><div><p className="eyebrow">Station control</p><h1>Your stations</h1><p className="meta">Program, secure, and monitor every TV and Radio station.</p></div><CreateStation genres={genres} /></div>
      <StationDashboard stations={result.rows.map((station) => ({ ...station, purge_after: station.purge_after?.toISOString() ?? null }))} deleted={deleted.rows.map((station) => ({ ...station, purge_after: station.purge_after?.toISOString() ?? null }))} initialCounts={counts} selectedKind={type} />
    </main>
  </>;
}
