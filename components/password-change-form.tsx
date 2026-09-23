"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function PasswordChangeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The password could not be changed.");
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The password could not be changed.");
      setBusy(false);
    }
  }

  return <form className="stack-lg" onSubmit={submit}>
    <div>
      <p className="eyebrow">Account security</p>
      <h1>Replace your temporary password</h1>
      <p className="meta">Choose a private password before using any account or management features. All sessions will be revoked, then you will sign in again.</p>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <label>Temporary password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
    <label>New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
    <button disabled={busy}>{busy ? "Changing password..." : "Change password and sign out"}</button>
  </form>;
}
