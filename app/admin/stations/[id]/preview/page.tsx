import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosticPreviewPlayer } from "@/components/diagnostic-preview-player";
import { hasAdminPreviewGrant } from "@/lib/admin-preview";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Diagnostic stream preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export default async function AdminStationPreviewPage({ params }: Context) {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  const { id } = await params;
  if (!(await hasAdminPreviewGrant(user.id, id))) notFound();
  return <main className="diagnostic-preview-page">
    <div className="diagnostic-preview-banner">
      <div><strong>Administrator diagnostic preview</strong><span>Read-only · access controls bypassed · not counted as a viewer</span></div>
      <Link className="button button-secondary" href="/admin#stations">Back to admin</Link>
    </div>
    <DiagnosticPreviewPlayer stationId={id} />
  </main>;
}
