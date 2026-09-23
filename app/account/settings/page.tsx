import Link from "next/link";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { WeatherLocationForm } from "@/components/weather-location-form";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  await requireUser();
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Brand href="/guide" /><nav className="nav-actions"><Link className="button button-quiet" href="/guide">Guide</Link><Link className="button button-quiet" href="/dashboard">My stations</Link><LogoutButton /></nav></div></header>
    <main className="shell page stack-lg">
      <div className="page-header"><div><p className="eyebrow">Private account</p><h1>Account settings</h1><p className="meta">Manage personal settings that are not shared publicly.</p></div></div>
      <WeatherLocationForm />
    </main>
  </>;
}
