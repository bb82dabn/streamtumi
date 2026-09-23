"use client";

import { CircleStop, Clipboard, ExternalLink, Layers3, Play } from "lucide-react";
import { useState } from "react";

export function RadioStationActions({ stationId, broadcastState, canStart, listenerUrl }: { stationId: string; broadcastState: "RUNNING" | "STOPPED"; canStart: boolean; listenerUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function toggleBroadcast() {
    setBusy(true); setNotice("");
    const action = broadcastState === "RUNNING" ? "stop" : "start";
    const response = await fetch(`/api/stations/${stationId}/broadcast/${action}`, action === "start" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "restart" }) } : { method: "POST" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setNotice(result.error || "Broadcast control failed.");
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return <div className="stack"><div className="cluster">{broadcastState === "RUNNING" ? <button className="button-secondary" disabled={busy} onClick={() => void toggleBroadcast()}><CircleStop size={17} /> Stop</button> : <button disabled={busy || !canStart} title={canStart ? undefined : "Publish automation before starting"} onClick={() => void toggleBroadcast()}><Play size={17} /> Start</button>}<a className="button" href={`/stations/${stationId}/production`}><Layers3 size={17} /> Production</a><a className="button button-secondary" href={listenerUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> View station</a><button className="button-quiet" disabled={busy} onClick={() => navigator.clipboard.writeText(listenerUrl).then(() => setNotice("Listener link copied."))}><Clipboard size={17} /> Copy link</button></div>{notice && <span className="meta">{notice}</span>}</div>;
}
