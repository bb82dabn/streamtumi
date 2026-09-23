import { Clock3, Eye, Radio, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { StationGenre } from "@/lib/genres";
import type { GuideData, GuideFilters, GuideStation } from "@/lib/guide";
import { StationEngagement, type EngagementState } from "@/components/station-engagement";
import { GuideArtworkPreview } from "@/components/guide-artwork-preview";
import { guideHref, guidePagination, stationResourceUrl } from "@/lib/guide-query";

function stationToken(station: GuideStation): string {
  return new URL(station.watchUrl).pathname.split("/").filter(Boolean).pop() ?? "";
}

function stationHref(station: GuideStation): string {
  return new URL(station.watchUrl).toString();
}

function relativeActivity(value: string | null): string {
  if (!value) return "No chat yet";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Chat active now";
  if (minutes < 60) return `Chat ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Chat ${hours}h ago`;
  return `Chat ${Math.floor(hours / 24)}d ago`;
}

function GuideCard({ station, signedIn, returnTo }: { station: GuideStation; signedIn: boolean; returnTo: string }) {
  const token = stationToken(station);
  const path = stationHref(station);
  const initial: EngagementState = {
    fanCount: station.fanCount,
    ratingAverage: station.ratingAverage,
    ratingCount: station.ratingCount,
    isFan: station.isFan,
    viewerRating: station.viewerRating,
    public: true,
    signedIn,
    isOwner: station.isOwner,
  };
  return <article className="guide-card">
    <Link className="guide-artwork" href={path} aria-label={`${station.stationKind === "RADIO" ? "Listen to" : "Watch"} ${station.name}`}>
      <GuideArtworkPreview token={token} stationName={station.name} genreName={station.genreName} hasSlate={station.hasSlate} hasLogo={station.hasLogo} previewVideoId={station.previewVideoId} previewThumbnailAvailable={station.previewThumbnailAvailable} previewOffsetMs={station.previewOffsetMs} online={station.online} radioArtworkUrl={station.radioArtworkUrl} watchUrl={station.watchUrl} />
      <span className={`guide-live-badge ${station.online ? "on-air" : ""}`}>{station.online ? "On air" : "Off air"}</span><span className="guide-type-badge">{station.stationKind === "RADIO" ? "Radio" : "TV"}</span>
      <span className="guide-viewers"><Eye size={13} aria-hidden="true" />{station.viewerCount}</span>
      {station.explicit && <span className="guide-explicit-badge">Explicit</span>}
    </Link>
    <div className="guide-card-body">
      <div><span className="meta">{station.genreName}</span><h2><Link href={path}>{station.name}</Link></h2><p className="meta">by {station.ownerName} · {station.stationKind === "RADIO" ? station.nowPlayingTitle ? `Now: ${station.nowPlayingArtist ? `${station.nowPlayingArtist} — ` : ""}${station.nowPlayingTitle}` : "Radio station" : "Always running"}</p></div>
      <p className="guide-description">{station.description || "No station description yet."}</p>
      <div className="guide-card-meta"><span><Clock3 size={14} aria-hidden="true" />{relativeActivity(station.lastChatAt)}</span></div>
      <StationEngagement token={token} initial={initial} returnTo={returnTo} compact />
      <Link className="button guide-watch-button" href={path}>{station.stationKind === "RADIO" ? "Listen live" : "Watch TV"}</Link>
    </div>
  </article>;
}

export function StreamGuide({ data, genres, filters, signedIn }: { data: GuideData; genres: StationGenre[]; filters: GuideFilters; signedIn: boolean }) {
  const returnTo = guideHref(filters, { page: data.page });
  const clearHref = guideHref(filters, { q: "", genre: undefined, sort: "viewers", onAir: false, page: 1 });
  const pagination = guidePagination(filters, data.page, data.pageCount);
  return <div className="stream-guide stack-lg">
    {signedIn && data.fanStations.length > 0 && <section className="fan-shelf stack" aria-labelledby="fan-shelf-title">
      <div className="guide-section-header"><div><p className="eyebrow">Your lineup</p><h2 id="fan-shelf-title">My Fan Stations</h2></div><span className="meta">Public stations you support</span></div>
      <div className="fan-shelf-row">{data.fanStations.map((station) => <Link href={stationHref(station)} className="fan-shelf-item" key={station.id}>{station.hasLogo ? <img src={stationResourceUrl(station.watchUrl, `/api/public/stations/${stationToken(station)}/assets/logo`)} alt="" /> : <Radio size={20} aria-hidden="true" />}<span><strong>{station.name}</strong><span className="meta">{station.online ? `${station.viewerCount} tuned in` : "Off air"}</span></span></Link>)}</div>
    </section>}

    <section className="guide-browser" aria-labelledby="guide-browser-title">
      <div className="guide-section-header"><div><p className="eyebrow">Browse stations</p><h2 id="guide-browser-title">What&apos;s streaming</h2></div><span className="meta">{data.total} public {data.total === 1 ? "station" : "stations"}</span></div>
      <form className="guide-filters" action="/guide" method="get">
        <label className="guide-search">Search<span><Search size={16} aria-hidden="true" /><input type="search" name="q" defaultValue={filters.q} placeholder="Station, owner, or topic" /></span></label>
        {filters.type !== "all" && <input type="hidden" name="type" value={filters.type} />}
        <label>Genre<select name="genre" defaultValue={filters.genre ?? ""}><option value="">All genres</option>{genres.map((genre) => <option value={genre.id} key={genre.id}>{genre.name}</option>)}</select></label>
        <label>Sort by<select name="sort" defaultValue={filters.sort}><option value="viewers">Live viewers</option><option value="rating">Top rated</option><option value="fans">Most fans</option><option value="chat">Recent chat</option><option value="newest">Newest</option><option value="name">Station name</option><option value="genre">Genre</option></select></label>
        <label className="guide-on-air"><input type="checkbox" name="onAir" value="true" defaultChecked={filters.onAir} /> On air only</label>
        <button><SlidersHorizontal size={16} aria-hidden="true" /> Apply</button>
      </form>

      {data.stations.length ? <div className="guide-grid">{data.stations.map((station) => <GuideCard key={station.id} station={station} signedIn={signedIn} returnTo={returnTo} />)}</div> : <div className="empty guide-empty"><h2>{filters.q || filters.genre || filters.onAir ? "No stations match these filters" : filters.type === "tv" ? "No TV stations yet" : filters.type === "radio" ? "No radio stations yet" : "No stations yet"}</h2><p>{filters.q || filters.genre || filters.onAir ? "Try another genre, remove the on-air filter, or search for a different topic." : "Check back as broadcasters join the Guide."}</p>{(filters.q || filters.genre || filters.onAir || filters.sort !== "viewers") && <Link className="button button-secondary" href={clearHref}>Clear filters</Link>}</div>}

      {data.pageCount > 1 && <nav className="guide-pagination" aria-label="Guide pages">{pagination.previous ? <Link className="button button-secondary" href={pagination.previous}>Previous</Link> : <span className="button button-secondary disabled" aria-disabled="true">Previous</span>}<span className="meta">Page {data.page} of {data.pageCount}</span>{pagination.next ? <Link className="button button-secondary" href={pagination.next}>Next</Link> : <span className="button button-secondary disabled" aria-disabled="true">Next</span>}</nav>}
    </section>
  </div>;
}
