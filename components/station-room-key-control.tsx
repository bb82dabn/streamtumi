"use client";

import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The room key could not be updated.");
  return result;
}

export function StationRoomKeyControl({ stationId, initialEnabled, initialRotatedAt, hasLegacyPassword = false }: {
  stationId: string;
  initialEnabled: boolean;
  initialRotatedAt: string | null;
  hasLegacyPassword?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rotatedAt, setRotatedAt] = useState(initialRotatedAt);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rotate() {
    if (enabled && !window.confirm("Rotate this room key? Saved viewers and active room sessions will lose access immediately.")) return;
    if (!enabled && hasLegacyPassword && !window.confirm("Generating a room key replaces the current viewer password. Continue?")) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(`/api/stations/${stationId}/room-key`, { method: "POST" });
      setEnabled(true);
      setAccessKey(result.accessKey);
      setRotatedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room key could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm("Disable the room key? The private viewer link will become the only access credential.")) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/stations/${stationId}/room-key`, { method: "DELETE" });
      setEnabled(false);
      setAccessKey(null);
      setRotatedAt(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room key could not be disabled.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card stack">
    <div className="card-header"><div><h2>Private room key</h2><p className="meta">Viewers enter six digits on Roku or mobile. The full share link opens directly in a browser.</p></div><KeyRound size={20} color="#b8bcc4" /></div>
    <span className={`status ${enabled ? "status-success" : "status-warning"}`}>{enabled ? "Key enabled" : "Not configured"}</span>
    {accessKey && <div className="notice notice-success"><strong style={{ display: "block", fontSize: 30, letterSpacing: 8 }}>{accessKey}</strong><span>Copy this key now. It is not stored in recoverable form.</span><button className="button-secondary" onClick={() => void navigator.clipboard.writeText(accessKey)}>Copy key</button></div>}
    {enabled && !accessKey && <p className="meta">The key was last changed {rotatedAt ? new Date(rotatedAt).toLocaleString() : "previously"}. Rotate it if you no longer have the original value.</p>}
    {!enabled && hasLegacyPassword && <div className="notice notice-warning">Generating a room key removes the current viewer password and replaces it with six-digit access.</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <div className="cluster"><button className="button-secondary" disabled={busy} onClick={() => void rotate()}><RefreshCw size={16} /> {enabled ? "Rotate key" : "Generate key"}</button>{enabled && <button className="button-quiet" disabled={busy} onClick={() => void disable()}><Trash2 size={16} /> Disable</button>}</div>
    <p className="meta">Changing or disabling the key revokes key-based memberships and app or TV sessions. To revoke browser links, regenerate the station share link.</p>
  </section>;
}
