"use client";

import { Flag, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type SubjectType = "STATION" | "VIDEO" | "CHAT_MESSAGE";

export function ReportDialog({ token, subjectType, subjectId, label = "Report" }: { token: string; subjectType: SubjectType; subjectId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/public/stations/${token}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          videoId: subjectType === "VIDEO" ? subjectId : undefined,
          messageId: subjectType === "CHAT_MESSAGE" ? subjectId : undefined,
          reason: form.get("reason"),
          details: form.get("details"),
          email: form.get("email") || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The report could not be submitted.");
      setReference(result.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="button-quiet report-trigger" onClick={() => { setOpen(true); setReference(""); setError(""); }}><Flag size={15} /> {label}</button>
    {open && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby={`report-${subjectType}-${subjectId ?? "station"}`}>
        <div className="card-header"><div><p className="eyebrow">Safety report</p><h2 id={`report-${subjectType}-${subjectId ?? "station"}`}>Report {subjectType === "CHAT_MESSAGE" ? "message" : subjectType.toLowerCase()}</h2></div><button ref={closeButton} type="button" className="button-quiet" aria-label="Close report dialog" onClick={() => setOpen(false)}><X size={20} /></button></div>
        {reference ? <div className="stack"><div className="notice notice-success" role="status"><strong>Report submitted.</strong><br />Reference: {reference}</div><p className="meta">A report does not automatically remove content. A moderator or authorized review service will assess it.</p><button type="button" onClick={() => setOpen(false)}>Done</button></div> : <form className="stack" onSubmit={submit}>
          <label>Reason<select name="reason" required defaultValue="ILLEGAL_CONTENT"><option value="ILLEGAL_CONTENT">Potentially illegal content</option><option value="CHILD_SAFETY">Child safety</option><option value="INTELLECTUAL_PROPERTY">Copyright or intellectual property</option><option value="VIOLENCE_OR_THREATS">Violence or threats</option><option value="HATE_OR_HARASSMENT">Hate or harassment</option><option value="SPAM_OR_SCAM">Spam or scam</option><option value="OTHER">Other</option></select></label>
          <label>What happened?<textarea name="details" required minLength={10} maxLength={2000} placeholder="Describe the content and why it should be reviewed." /></label>
          <label>Contact email <span className="meta">(optional)</span><input name="email" type="email" maxLength={254} /></label>
          <p className="meta">Do not upload or reproduce illegal material in this form. If someone is in immediate danger, contact local emergency services.</p>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <button disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button>
        </form>}
      </section>
    </div>}
  </>;
}
