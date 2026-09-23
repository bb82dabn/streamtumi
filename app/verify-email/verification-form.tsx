"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export function VerificationForm({ token }: { token: string }) {
  const attempted = useRef(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(token ? "Verifying your email..." : "Open the link from your email or request a new one.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(Boolean(token));

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    void fetch("/api/auth/verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Email verification failed.");
      setStatus("Your email is verified. Community features are now available.");
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Email verification failed.");
      setStatus("");
    }).finally(() => setBusy(false));
  }, [token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The verification email could not be requested.");
      setStatus(body.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The verification email could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <div>
        <h1>Verify your email</h1>
        <p className="meta">Verification is required to post, become a fan, or update your community profile.</p>
      </div>
      {status && <div className="notice" role="status">{status}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <form className="stack-lg" onSubmit={resend}>
        <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button disabled={busy}>{busy ? "Please wait..." : "Send a new verification email"}</button>
      </form>
    </div>
  );
}
