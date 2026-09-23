import Link from "next/link";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { ModerationQueue } from "@/components/moderation-queue";
import { requireUser } from "@/lib/auth";
import { getModerationOverview, listReports } from "@/lib/moderation";
import { notFound } from "next/navigation";

export const metadata = { title: "Moderation dashboard" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const user = await requireUser();
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") notFound();
  const [reports, overview] = await Promise.all([listReports(), getModerationOverview()]);

  return <>
    <header className="topbar">
      <div className="shell topbar-inner">
        <Brand href="/dashboard" />
        <nav className="nav-actions" aria-label="Account navigation">
          {user.role === "ADMIN" && <Link className="button button-quiet" href="/admin">Admin</Link>}
          <Link className="button button-quiet" href="/guide">Guide</Link>
          <Link className="button button-quiet" href="/dashboard">Stations</Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
    <main className="shell page moderation-page">
      <div className="page-header moderation-page-header">
        <div>
          <p className="eyebrow">Trust &amp; safety operations</p>
          <h1>Moderation dashboard</h1>
          <p className="meta">Triage reports, preserve evidence, and record reversible decisions.</p>
        </div>
        <div className="reviewer-context" aria-label={`Signed in as ${user.displayName}, ${user.role.toLowerCase()}`}>
          <span className="status status-success">On duty</span>
          <div>
            <strong>{user.displayName}</strong>
            <span className="meta">{user.role === "ADMIN" ? "Administrator" : "Moderator"}</span>
          </div>
        </div>
      </div>
      <ModerationQueue
        initialReports={reports.map((report) => ({
          ...report,
          created_at: report.created_at.toISOString(),
          updated_at: report.updated_at.toISOString(),
          resolved_at: report.resolved_at?.toISOString() ?? null,
        }))}
        initialOverview={overview}
        isAdmin={user.role === "ADMIN"}
      />
    </main>
  </>;
}
