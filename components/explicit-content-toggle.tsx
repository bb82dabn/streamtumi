"use client";

import { EyeOff, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ExplicitContentToggle({ enabled, attested }: { enabled: boolean; attested: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(showExplicitContent: boolean, confirmAdult = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/content-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showExplicitContent, confirmAdult }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Preference could not be saved.");
      setDialog(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preference could not be saved.");
    } finally { setBusy(false); }
  }

  function enable() {
    if (attested) void save(true, true);
    else setDialog(true);
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(true, true);
  }

  return <>
    <button type="button" className={enabled ? "button-secondary" : "button-quiet"} role="switch" aria-checked={enabled} disabled={busy} onClick={() => enabled ? void save(false) : enable()}>
      <EyeOff size={16} aria-hidden="true" /> {enabled ? "Explicit content shown" : "Explicit content hidden"}
    </button>
    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDialog(false); }}>
      <section className="dialog explicit-dialog stack-lg" role="dialog" aria-modal="true" aria-labelledby="explicit-dialog-title">
        <div className="card-header"><div><p className="eyebrow">Content preference</p><h2 id="explicit-dialog-title">Show explicit stations?</h2></div><button type="button" className="button-quiet" aria-label="Close" onClick={() => setDialog(false)}><X size={18} /></button></div>
        <div className="notice notice-warning"><ShieldAlert size={18} aria-hidden="true" /> Explicit stations may contain mature language, imagery, themes, or discussions.</div>
        <form className="stack" onSubmit={confirm}>
          <label className="explicit-confirm"><input type="checkbox" required /> I confirm that I am at least 18 years old and want explicit stations included in my Stream Guide.</label>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <div className="cluster"><button disabled={busy}>{busy ? "Saving…" : "Confirm and show"}</button><button type="button" className="button-quiet" disabled={busy} onClick={() => setDialog(false)}>Cancel</button></div>
        </form>
      </section>
    </div>}
  </>;
}
