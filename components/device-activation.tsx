"use client";

import { MonitorSmartphone, ShieldCheck, Unplug } from "lucide-react";
import { FormEvent, useState } from "react";
import type { LinkedDevice } from "@/packages/contracts/src/device";

type Props = {
  initialCode: string;
  initialDevices: LinkedDevice[];
};

function formatCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export function DeviceActivation({ initialCode, initialDevices }: Props) {
  const [userCode, setUserCode] = useState(formatCode(initialCode));
  const [devices, setDevices] = useState(initialDevices);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/device/v1/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The device could not be linked.");
      setNotice(`${payload.device.displayName} is approved. Return to the TV to finish linking.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The device could not be linked.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: LinkedDevice) {
    if (!window.confirm(`Unlink ${device.displayName}?`)) return;
    setRevokingId(device.id);
    setError("");
    try {
      const response = await fetch(`/api/account/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The device could not be unlinked.");
      setDevices((current) => current.filter((item) => item.id !== device.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The device could not be unlinked.");
    } finally {
      setRevokingId("");
    }
  }

  return (
    <div className="device-activation-layout">
      <section className="card stack-lg device-activation-card">
        <div className="device-activation-icon"><MonitorSmartphone size={28} aria-hidden="true" /></div>
        <div className="stack">
          <p className="eyebrow">TV activation</p>
          <h1>Link a screen</h1>
          <p className="meta">Enter the code shown by StreamTumi on your Roku or TV. Codes expire after 10 minutes.</p>
        </div>
        <form className="stack" onSubmit={activate}>
            <label htmlFor="device-user-code">Activation code
              <input
                id="device-user-code"
                name="userCode"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={9}
                onChange={(event) => setUserCode(formatCode(event.target.value))}
                placeholder="ABCD-EFGH"
                required
                value={userCode}
              />
            </label>
            <button disabled={busy || userCode.length !== 9}>{busy ? "Approving..." : "Link device"}</button>
        </form>
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
        {notice ? <div className="notice notice-success" role="status"><ShieldCheck size={18} aria-hidden="true" /> {notice}</div> : null}
        <p className="meta">Linking grants catalog access, private-room membership, and tune-history submission. It does not grant profile, billing, or community posting access.</p>
      </section>

      <section className="card stack device-list-card">
        <div className="card-header">
          <div><p className="eyebrow">Your account</p><h2>Linked devices</h2></div>
          <span className="status">{devices.length}</span>
        </div>
        {!devices.length ? <div className="empty"><h2>No linked devices</h2><p>Approved Roku and TV clients will appear here after they finish linking.</p></div> : (
          <div className="device-list">
            {devices.map((device) => (
              <div className="device-list-row" key={device.id}>
                <div className="device-list-icon"><MonitorSmartphone size={21} aria-hidden="true" /></div>
                <div>
                  <strong>{device.displayName}</strong>
                  <span>{device.deviceType === "ROKU" ? "Roku" : "TV"} / Last used {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleDateString() : "not yet"}</span>
                </div>
                <button className="button button-danger" disabled={revokingId === device.id} onClick={() => void revoke(device)} type="button">
                  <Unplug size={17} aria-hidden="true" /> {revokingId === device.id ? "Unlinking..." : "Unlink"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
