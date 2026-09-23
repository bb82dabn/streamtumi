import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { loadAdminDashboard } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Admin control center" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  const data = await loadAdminDashboard();

  return <>
    <header className="topbar">
      <div className="shell topbar-inner">
        <Brand href="/admin" />
        <nav className="nav-actions" aria-label="Account navigation"><LogoutButton /></nav>
      </div>
    </header>
    <main className="shell page admin-page">
      <div className="page-header admin-page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>System control center</h1>
          <p className="meta">Monitor the platform, manage trusted access, and inspect system-wide inventory.</p>
        </div>
        <div className="cluster admin-header-actions">
          <Link className="button button-secondary" href="/guide">Stream Guide</Link>
          <Link className="button button-secondary" href="/dashboard">Station workspace</Link>
          <Link className="button" href="/moderation">Review reports</Link>
        </div>
      </div>
      <AdminDashboard initialData={data} currentUserId={user.id} />
    </main>
  </>;
}
