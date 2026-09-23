"use client";

import { Clock3, Plus, Radio, Tv, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { StationGenre } from "@/lib/genres";
import type { StationKind } from "@/lib/station-kind";

export function CreateStation({ genres, defaultKind = "TV", lockedKind }: { genres: StationGenre[]; defaultKind?: StationKind; lockedKind?: StationKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stationKind, setStationKind] = useState<StationKind>(lockedKind ?? defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          stationKind,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          genreId: form.get("genreId"),
          visibility: form.get("visibility"),
          ownerDeclaredExplicit: form.get("ownerDeclaredExplicit") === "on",
          transitionMs: 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create station.");
       router.push(`/stations/${data.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create station.");
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={() => setOpen(true)}><Plus size={18} aria-hidden="true" /> New {lockedKind === "RADIO" ? "Radio " : lockedKind === "TV" ? "TV " : ""}station</button>
      {open && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div className="card-header"><div><h2 id="create-title">Create a station</h2><p className="meta">You can refine branding and access controls next.</p></div><button className="button-quiet" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></div>
          <form className="stack-lg" onSubmit={submit}>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            {!lockedKind && <fieldset className="station-kind-fieldset">
              <legend>Media format</legend>
              <div className="station-kind-options">
                <label className={stationKind === "TV" ? "station-kind-option selected" : "station-kind-option"}>
                  <input type="radio" name="stationKind" value="TV" checked={stationKind === "TV"} onChange={() => setStationKind("TV")} />
                  <Tv size={22} aria-hidden="true" />
                  <span><strong>TV</strong><small>Video picture with optional audio. Choose its programming style after creation.</small></span>
                </label>
                <label className={stationKind === "RADIO" ? "station-kind-option selected" : "station-kind-option"}>
                  <input type="radio" name="stationKind" value="RADIO" checked={stationKind === "RADIO"} onChange={() => setStationKind("RADIO")} />
                  <Radio size={22} aria-hidden="true" />
                  <span><strong>Radio</strong><small>Audio-first output with an optional visual. Choose its programming style after creation.</small></span>
                </label>
              </div>
            </fieldset>}
            <label>Station name<input name="name" required maxLength={120} autoFocus /></label>
            <label>Description<textarea name="description" maxLength={2000} /></label>
            <label>Genre<select name="genreId" required defaultValue=""><option value="" disabled>Choose a genre</option>{genres.map((genre) => <option value={genre.id} key={genre.id}>{genre.name}</option>)}</select></label>
            <label>Visibility<select name="visibility" defaultValue="PRIVATE"><option value="PRIVATE">Private — unlisted viewer link</option><option value="PUBLIC">Public — listed in Stream Guide</option></select></label>
            <label className="guide-on-air"><input type="checkbox" name="ownerDeclaredExplicit" /> Contains explicit content</label>
            <div className="notice station-create-note"><Clock3 size={18} aria-hidden="true" /><span>Media format controls what the station outputs—not how it is programmed. StreamTumi starts with a safe recommended profile; you can explore loops, weekly schedules, calendars, and rotations afterward.</span></div>
            <div className="cluster"><button disabled={busy}>{busy ? "Creating…" : "Create station"}</button><button className="button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
          </form>
        </section>
      </div>}
    </>
  );
}
