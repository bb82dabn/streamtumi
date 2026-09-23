"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AuthForm({ mode, next = "/dashboard", registrationEnabled = true }: { mode: "login" | "register"; next?: string; registrationEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      ...(mode === "register" ? { displayName: form.get("displayName") } : {}),
      email: form.get("email"),
      password: form.get("password"),
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication failed.");
      router.push(data.mustChangePassword ? "/account/change-password" : next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
      setBusy(false);
    }
  }
  return (
    <form className="stack-lg" onSubmit={submit}>
      <div>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="meta">{mode === "login" ? "Open your station dashboard." : "Your private channels start here."}</p>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {mode === "register" && <label>Display name<input name="displayName" autoComplete="name" required maxLength={80} /></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : 1} maxLength={128} /></label>
      {mode === "login" && <p className="meta"><Link href="/forgot-password" style={{ color: "white", textDecoration: "underline" }}>Forgot your password?</Link></p>}
      <button disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      {(mode === "register" || registrationEnabled) && <p className="meta">
        {mode === "login" ? "New to StreamTumi? " : "Already have an account? "}
        <Link href={`${mode === "login" ? "/register" : "/login"}?next=${encodeURIComponent(next)}`} style={{ color: "white", textDecoration: "underline" }}>
          {mode === "login" ? "Create one" : "Sign in"}
        </Link>
      </p>}
    </form>
  );
}
