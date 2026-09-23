"use client";

import { MessageSquare, Pin, PinOff, Send, ShieldX } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ReportDialog } from "@/components/report-dialog";

type Message = { id: string; authorKind: "GUEST" | "REGISTERED" | "HOST"; authorName: string; body: string; createdAt: string; pinnedAt: string | null; hidden: boolean };
type Viewer = { kind: Message["authorKind"]; displayName: string; canModerate: boolean } | null;

function messageBody(body: string): ReactNode[] {
  return body.split(/(https?:\/\/[^\s]+)/g).filter(Boolean).map((part, index) => {
    if (!part.startsWith("http://") && !part.startsWith("https://")) return <span key={index}>{part}</span>;
    try {
      const url = new URL(part);
      if (url.protocol !== "http:" && url.protocol !== "https:") return <span key={index}>{part}</span>;
      return <a key={index} href={url.toString()} target="_blank" rel="noopener noreferrer nofollow ugc">{part}</a>;
    } catch { return <span key={index}>{part}</span>; }
  });
}

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Request failed."), { code: result.code });
  return result;
}

export function StationChat({ token, currentVideo, onViewerCount, onStationUpdated }: { token: string; currentVideo: { id: string; title: string } | null; onViewerCount: (count: number) => void; onStationUpdated: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinned, setPinned] = useState<Message[]>([]);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await requestJson(`/api/public/stations/${token}/chat/messages`, { cache: "no-store" });
      setMessages(data.messages); setPinned(data.pinned); setViewer(data.viewer); setLoaded(true); setError("");
      requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chat could not be loaded."); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const events = new EventSource(`/api/public/stations/${token}/chat/events`);
    const created = (raw: Event) => {
      const message = JSON.parse((raw as MessageEvent).data) as Message;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-200));
      requestAnimationFrame(() => {
        const log = logRef.current;
        if (log && log.scrollHeight - log.scrollTop - log.clientHeight < 160) log.scrollTop = log.scrollHeight;
      });
    };
    const updated = (raw: Event) => {
      const message = JSON.parse((raw as MessageEvent).data) as Message;
      setMessages((current) => current.map((item) => item.id === message.id ? message : item));
      setPinned((current) => message.pinnedAt && !message.hidden
        ? [message, ...current.filter((item) => item.id !== message.id)]
        : current.filter((item) => item.id !== message.id));
    };
    const presence = (raw: Event) => onViewerCount(Number(JSON.parse((raw as MessageEvent).data).viewerCount ?? 0));
    events.addEventListener("message.created", created);
    events.addEventListener("message.updated", updated);
    events.addEventListener("presence", presence);
    events.addEventListener("station.updated", onStationUpdated);
    events.onerror = () => setError("Chat is reconnecting…");
    events.onopen = () => setError("");
    return () => events.close();
  }, [loaded, onStationUpdated, onViewerCount, token]);

  useEffect(() => {
    if (!loaded) return;
    const heartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await requestJson(`/api/public/stations/${token}/presence`, { method: "POST" });
        onViewerCount(Number(data.viewerCount ?? 0));
      } catch { /* presence never interrupts chat or playback */ }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); };
  }, [loaded, onViewerCount, token]);

  async function setUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const username = new FormData(event.currentTarget).get("username");
    try {
      await requestJson(`/api/public/stations/${token}/chat/identity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Username could not be saved."); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError("");
    try {
      const data = await requestJson(`/api/public/stations/${token}/chat/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message]);
      setBody("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Message could not be sent."); }
    finally { setBusy(false); }
  }

  async function moderate(message: Message, action: "pin" | "unpin" | "hide") {
    setError("");
    try {
      const path = `/api/public/stations/${token}/chat/messages/${message.id}/${action === "hide" ? "hide" : "pin"}`;
      await requestJson(path, { method: action === "unpin" ? "DELETE" : action === "pin" ? "PUT" : "POST", headers: action === "hide" ? { "Content-Type": "application/json" } : undefined, body: action === "hide" ? JSON.stringify({ reason: "Hidden by host" }) : undefined });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Moderation action failed."); }
  }

  return <aside className="chat-panel" aria-label="Station chat">
    <header className="chat-header"><div><div className="cluster"><MessageSquare size={18} /><h2>Live chat</h2></div><p className="meta">StreamTumi community chat</p></div><div className="chat-report-actions"><ReportDialog token={token} subjectType="STATION" label="Station" />{currentVideo && <ReportDialog token={token} subjectType="VIDEO" subjectId={currentVideo.id} label="Video" />}</div></header>
    {pinned.length > 0 && <section className="pinned-messages" aria-label="Pinned messages"><div className="cluster"><Pin size={15} /><strong>Pinned</strong></div>{pinned.map((message) => <div key={message.id} className="pinned-message"><span className="meta">{message.authorName}</span><p>{messageBody(message.body)}</p></div>)}</section>}
    <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text">
      {!loaded && <div className="empty"><h2>Loading chat</h2><p>Connecting to the station conversation.</p></div>}
      {loaded && messages.length === 0 && <div className="empty"><h2>Start the conversation</h2><p>Be the first person to say hello.</p></div>}
      {messages.map((message) => <article className={`chat-message ${message.hidden ? "chat-message-hidden" : ""}`} data-message-id={message.id} key={message.id}>
        <div className="chat-message-head"><div><strong>{message.authorName}</strong> <span className={`chat-role chat-role-${message.authorKind.toLowerCase()}`}>{message.authorKind === "GUEST" ? "Guest" : message.authorKind === "HOST" ? "Host" : "Registered"}</span></div><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
        <p className="chat-body">{messageBody(message.body)}</p>
        {!message.hidden && <div className="chat-message-actions">{viewer?.canModerate && <>{message.pinnedAt ? <button type="button" className="button-quiet" onClick={() => void moderate(message, "unpin")}><PinOff size={14} /> Unpin</button> : <button type="button" className="button-quiet" onClick={() => void moderate(message, "pin")}><Pin size={14} /> Pin</button>}<button type="button" className="button-quiet" onClick={() => void moderate(message, "hide")}><ShieldX size={14} /> Hide</button></>}<ReportDialog token={token} subjectType="CHAT_MESSAGE" subjectId={message.id} /></div>}
      </article>)}
    </div>
    {error && <div className="chat-error" role="status">{error}</div>}
    {loaded && !viewer ? <form className="chat-identity" onSubmit={setUsername}><label>Choose a chat username<input name="username" required minLength={2} maxLength={32} autoComplete="nickname" /></label><button disabled={busy}>Join chat</button></form> : loaded && <form className="chat-composer" onSubmit={send}><label className="sr-only" htmlFor="chat-message">Message</label><textarea id="chat-message" value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={500} placeholder={`Message as ${viewer?.displayName}`} /><button aria-label="Send message" disabled={busy || !body.trim()}><Send size={18} /></button></form>}
  </aside>;
}
