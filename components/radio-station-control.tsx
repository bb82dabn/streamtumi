import { Headphones, Radio, Sparkles, TimerReset } from "lucide-react";
import { notFound } from "next/navigation";
import { RadioBrand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { RadioProgrammingEditor } from "@/components/radio-programming-editor";
import { RadioStationActions } from "@/components/radio-station-actions";
import { RadioTrackLibrary } from "@/components/radio-track-library";
import { RadioVisualSettings } from "@/components/radio-visual-settings";
import { StudioDashboardPanel } from "@/components/studio-dashboard-panel";
import { StationOperatingModel } from "@/components/station-operating-model";
import { StationSectionNav, type StationSection } from "@/components/station-section-nav";
import { StationRoomKeyControl } from "@/components/station-room-key-control";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { viewerCounts } from "@/lib/presence";
import { viewerUrl } from "@/lib/stations";
import { stationRoomAccessState } from "@/lib/station-rooms";
import { STATION_STORAGE_LIMIT_BYTES } from "@/lib/storage-quota";

type RadioStation = {
  id: string;
  name: string;
  description: string;
  broadcast_state: "RUNNING" | "STOPPED";
  visibility: "PRIVATE" | "PUBLIC";
  time_zone: string;
  genre_name: string;
  access_token_ciphertext: string;
  active_clock_release_id: string | null;
  access_password_hash: string | null;
};

const setupSteps = [
  { icon: TimerReset, name: "Program the clock", description: "Place rotations and jingles into a weekly broadcast schedule." },
  { icon: Sparkles, name: "Choose the visual", description: "Publish track artwork, a built-in visualizer, or an uploaded video loop." },
] as const;

export async function RadioStationControl({ stationId, ownerId, section = "overview" }: { stationId: string; ownerId: string; section?: StationSection }) {
  const result = await query<RadioStation>(
    `SELECT s.id, s.name, s.description, s.broadcast_state, s.visibility, s.time_zone, s.active_clock_release_id,
             s.access_token_ciphertext, s.access_password_hash, g.name AS genre_name
       FROM stations s JOIN station_genres g ON g.id = s.genre_id
      WHERE s.id = $1 AND s.owner_id = $2 AND s.station_kind = 'RADIO' AND s.deleted_at IS NULL`,
    [stationId, ownerId],
  );
  const station = result.rows[0];
  if (!station) notFound();
  const listenUrl = viewerUrl(station.access_token_ciphertext, "RADIO");
  const viewers = (await viewerCounts([station.id]))[station.id] ?? 0;
  const roomAccess = await stationRoomAccessState(station.id, ownerId);

  return <>
    <header className="topbar"><div className="shell topbar-inner"><RadioBrand href="/dashboard?type=radio" /><nav className="nav-actions"><a className="button button-quiet hide-mobile" href="/dashboard">All stations</a><LogoutButton /></nav></div></header>
    <main className="shell page station-management" data-station-section={section}>
      <div className="page-header"><div><p className="eyebrow">Station control</p><h1>{station.name}</h1><div className="cluster station-live-summary"><span className={`status ${station.broadcast_state === "RUNNING" ? "status-success" : "status-warning"}`}>{station.broadcast_state === "RUNNING" ? "Running" : "Stopped"}</span><span className={`status ${station.visibility === "PUBLIC" ? "status-success" : ""}`}>{station.visibility.toLowerCase()}</span><span className="viewer-count">{viewers} tuned in</span><span className="meta">Continuous Radio · listeners join whatever is on air.</span></div></div><RadioStationActions stationId={station.id} broadcastState={station.broadcast_state} canStart={Boolean(station.active_clock_release_id)} listenerUrl={listenUrl} /></div>
      <StationSectionNav stationId={station.id} active={section} />
      <div className="editor-grid">
        <div className="editor-main">
          <section className="station-section station-section-overview"><div className="station-overview-grid"><a className="card station-overview-card" href={`/stations/${station.id}/media`}><span className="station-task-number">1</span><span className="eyebrow">Add Media</span><h2>Build Your Audio Library</h2><p>Upload and prepare tracks for music groups.</p><span className="status">Manage tracks</span></a><a className="card station-overview-card" href={`/stations/${station.id}/programming`}><span className="station-task-number">2</span><span className="eyebrow">Build Programming</span><h2>Radio Schedule</h2><p>Create music groups and weekly start times.</p><span className={`status ${station.active_clock_release_id ? "status-success" : "status-warning"}`}>{station.active_clock_release_id ? "Published" : "Needs publishing"}</span></a><a className="card station-overview-card" href={`/stations/${station.id}/production`}><span className="station-task-number">3</span><span className="eyebrow">Production</span><h2>Build Show Projects</h2><p>Configure reusable decks, carts, and production notes.</p><span className="status">Open production</span></a></div></section>
          <div className="station-section station-section-overview"><StationOperatingModel stationId={station.id} /></div>
          <div className="station-section station-section-media"><RadioTrackLibrary stationId={station.id} maxUploadBytes={env().MAX_UPLOAD_BYTES} maxStorageBytes={STATION_STORAGE_LIMIT_BYTES} /></div>
          <div className="station-section station-section-programming"><RadioProgrammingEditor stationId={station.id} /></div>
          <div className="station-section station-section-production"><StudioDashboardPanel stationId={station.id} /><RadioVisualSettings stationId={station.id} /></div>
        </div>
        <aside className="editor-side station-section station-section-settings">
          <section className="card stack"><div className="card-header"><div><h2>Station details</h2><p className="meta">Radio identity and programming context.</p></div><Radio size={20} color="#b8bcc4" /></div><div><strong>{station.name}</strong><p className="meta">{station.description || "No station description yet."}</p></div><div className="cluster"><span className="status">{station.genre_name}</span><span className="status">{station.time_zone}</span></div></section>
          <section className="card stack"><h2>Broadcast model</h2><p className="meta">Weekly clock programming built from prepared local audio rotations.</p><div className="notice">Listeners join the current point in the published clock.</div></section>
          <section className="card stack"><div className="card-header"><div><h2>Listener link</h2><p className="meta">Share this link with listeners.</p></div><Headphones size={20} color="#b8bcc4" /></div><code className="radio-dashboard-listener-url">{listenUrl}</code><a className="button button-secondary" href={listenUrl} target="_blank" rel="noreferrer">Open listener</a></section>
          <StationRoomKeyControl stationId={station.id} initialEnabled={roomAccess.enabled} initialRotatedAt={roomAccess.rotatedAt} hasLegacyPassword={Boolean(station.access_password_hash)} />
          <section className="card stack"><div><h2>Station setup</h2><p className="meta">Complete the Radio workflow before starting playout.</p></div>{setupSteps.map(({ icon: Icon, name, description }, index) => <div className="radio-dashboard-step" key={name}><span className="radio-step-number">0{index + 2}</span><Icon size={20} aria-hidden="true" /><div><strong>{name}</strong><p className="meta">{description}</p></div></div>)}</section>
        </aside>
      </div>
    </main>
  </>;
}
