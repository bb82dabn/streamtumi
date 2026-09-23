"use client";

import { Heart, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export type EngagementState = {
  fanCount: number;
  ratingAverage: number;
  ratingCount: number;
  isFan: boolean;
  viewerRating: number | null;
  public: boolean;
  signedIn: boolean;
  isOwner: boolean;
};

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

export function StationEngagement({ token, initial, returnTo, compact = false }: { token: string; initial?: EngagementState; returnTo: string; compact?: boolean }) {
  const [state, setState] = useState<EngagementState | null>(initial ?? null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) return;
    let ignore = false;
    void requestJson(`/api/public/stations/${token}/engagement`, { cache: "no-store" })
      .then((data) => { if (!ignore) setState(data); })
      .catch((caught) => { if (!ignore) setError(caught instanceof Error ? caught.message : "Engagement could not be loaded."); });
    return () => { ignore = true; };
  }, [initial, token]);

  async function toggleFan() {
    if (!state) return;
    setBusy("fan"); setError("");
    try {
      const result = await requestJson(`/api/public/stations/${token}/fan`, { method: state.isFan ? "DELETE" : "PUT" });
      setState({ ...state, ...result });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Fan status could not be changed."); }
    finally { setBusy(""); }
  }

  async function chooseRating(rating: number) {
    if (!state) return;
    setBusy("rating"); setError("");
    try {
      const result = await requestJson(`/api/public/stations/${token}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      setState({ ...state, ...result });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Rating could not be saved."); }
    finally { setBusy(""); }
  }

  if (!state) return <div className="station-engagement station-engagement-loading"><span className="meta">Loading station community…</span></div>;
  const signInUrl = `/login?next=${encodeURIComponent(returnTo)}`;
  return <div className={`station-engagement ${compact ? "station-engagement-compact" : ""}`}>
    <div className="fan-summary"><Heart size={16} fill={state.isFan ? "currentColor" : "none"} aria-hidden="true" /><strong>{state.fanCount}</strong><span className="meta">{state.fanCount === 1 ? "fan" : "fans"}</span></div>
    <div className="rating-summary" aria-label={`${state.ratingAverage.toFixed(1)} out of 5 from ${state.ratingCount} ratings`}><Star size={16} fill={state.ratingCount ? "currentColor" : "none"} aria-hidden="true" /><strong>{state.ratingCount ? state.ratingAverage.toFixed(1) : "New"}</strong><span className="meta">{state.ratingCount ? `(${state.ratingCount})` : "No ratings"}</span></div>
    {state.public && !state.isOwner && (state.signedIn ? <>
      <button type="button" className={state.isFan ? "button-secondary" : ""} disabled={Boolean(busy)} aria-pressed={state.isFan} onClick={() => void toggleFan()}><Heart size={16} fill={state.isFan ? "currentColor" : "none"} aria-hidden="true" />{busy === "fan" ? "Saving…" : state.isFan ? "Fan" : "Become a fan"}</button>
      <div className="rating-control" aria-label="Rate this station">{[1, 2, 3, 4, 5].map((rating) => <button type="button" className="button-quiet" key={rating} aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`} aria-pressed={state.viewerRating === rating} disabled={Boolean(busy)} onClick={() => void chooseRating(rating)}><Star size={17} fill={(state.viewerRating ?? 0) >= rating ? "currentColor" : "none"} /></button>)}</div>
    </> : <Link className="button button-secondary" href={signInUrl}><Heart size={16} aria-hidden="true" /> Sign in to become a fan</Link>)}
    {state.isOwner && <span className="meta">Your station</span>}
    {!state.public && <span className="meta">Engagement is available when this station is public.</span>}
    {!compact && <Link className="button button-quiet" href="/guide">Stream Guide</Link>}
    {error && <span className="engagement-error" role="status">{error}</span>}
  </div>;
}
