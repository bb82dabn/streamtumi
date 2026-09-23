import Link from "next/link";
import { Brand } from "@/components/brand";
import { currentUser } from "@/lib/auth";
import { registrationEnabled } from "@/lib/registration-policy";

export default async function Home() {
  const user = await currentUser();
  const canRegister = registrationEnabled();
  return (
    <>
      <header className="topbar"><div className="shell topbar-inner">
        <Brand />
        <nav className="nav-actions" aria-label="Account">
          <Link className="button button-quiet hide-mobile" href="/guide?type=radio">Radio Guide</Link><Link className="button button-quiet" href="/guide">Stream Guide</Link>{user ? <Link className="button" href="/dashboard">Open dashboard</Link> : <><Link className={canRegister ? "button button-quiet" : "button"} href="/login">Sign in</Link>{canRegister && <Link className="button" href="/register">Create station</Link>}</>}
        </nav>
      </div></header>
      <main className="hero"><div className="shell hero-grid">
        <section className="stack-lg">
          <p className="eyebrow">Private television, under your control</p>
          <h1>Your videos. One continuous channel.</h1>
          <p className="hero-copy">Upload your programming, arrange the running order, and share a secure unlisted link or publish your station in the Stream Guide. Your channel keeps running continuously, and every viewer joins whatever is currently on air.</p>
          <div className="cluster"><Link className="button" href={user ? "/dashboard" : canRegister ? "/register" : "/login"}>{user ? "Open dashboard" : canRegister ? "Build your channel" : "Sign in"}</Link><Link className="button button-secondary" href="/guide">Browse Stream Guide</Link></div>
          <p className="meta">Adaptive HLS playback · Secure private links · Automatic looping</p>
        </section>
        <div className="broadcast-frame" aria-label="StreamTumi broadcast preview"><div className="broadcast-screen"><div className="broadcast-bars" aria-hidden="true"><span/><span/><span/><span/><span/></div><span className="on-air" style={{ position: "absolute", left: 16, bottom: 16 }}>ON AIR</span></div></div>
      </div></main>
      <section id="how-it-works" className="shell page stack-lg" aria-labelledby="how-title">
        <div><p className="eyebrow">The rundown</p><h2 id="how-title">From files to a dependable private broadcast</h2></div>
        <div className="dashboard-grid">
          <article className="card stack"><span className="meta">01 · INGEST</span><h3>Upload real media</h3><p className="meta">Every file is validated, normalized with FFmpeg, thumbnailed, and packaged as adaptive HLS before it can enter a live schedule.</p></article>
          <article className="card stack"><span className="meta">02 · PROGRAM</span><h3>Arrange the running order</h3><p className="meta">Drag videos into order, edit their metadata, and publish changes now or cleanly at the next loop boundary.</p></article>
          <article className="card stack"><span className="meta">03 · TRANSMIT</span><h3>Share without sharing control</h3><p className="meta">Send viewers a revocable, unlisted link. Add a password or expiration without exposing your management dashboard.</p></article>
        </div>
      </section>
      <section className="radio-cross-promo"><div className="shell radio-cross-promo-inner"><div><p className="eyebrow">Prefer audio?</p><h2>Find Radio in the Stream Guide.</h2><p className="meta">Discover continuous audio, scheduled shows, and synchronized television visuals alongside every StreamTumi station.</p></div><Link className="button" href="/guide?type=radio">Browse Radio</Link></div></section>
    </>
  );
}
