"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PasswordResetForm({ token }: { token?: string }) {
  const resetting = token !== undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (resetting && newPassword !== String(form.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/password/${resetting ? "reset" : "forgot"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetting
          ? { token, newPassword }
          : { email: form.get("email") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The request could not be completed.");
      setMessage(resetting ? "Your password has been reset. Sign in with the new password." : data.message);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-lg" onSubmit={submit}>
      <div>
        <h1>{resetting ? "Choose a new password" : "Reset your password"}</h1>
        <p className="meta">
          {resetting
            ? "This single-use link expires 30 minutes after it was requested."
            : "Enter your email. The response is the same whether or not a password account exists."}
        </p>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {message && <div className="notice notice-success" role="status">{message}</div>}
      {resetting ? (
        <>
          <label>New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
        </>
      ) : (
        <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      )}
      <button disabled={busy || (resetting && token.length !== 43)}>{busy ? "Please wait..." : resetting ? "Reset password" : "Send reset instructions"}</button>
      <p className="meta"><Link href="/login" style={{ color: "white", textDecoration: "underline" }}>Return to sign in</Link></p>
    </form>
  );
}
