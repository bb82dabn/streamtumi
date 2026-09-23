import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { DeviceActivation } from "@/components/device-activation";
import { currentUser } from "@/lib/auth";
import { listLinkedDevices } from "@/lib/device-auth";

export const metadata = { title: "Activate a TV" };
export const dynamic = "force-dynamic";

type Context = { searchParams: Promise<{ user_code?: string | string[] }> };

export default async function ActivatePage({ searchParams }: Context) {
  const params = await searchParams;
  const rawCode = Array.isArray(params.user_code) ? params.user_code[0] : params.user_code;
  const next = rawCode ? `/activate?user_code=${encodeURIComponent(rawCode)}` : "/activate";
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const devices = await listLinkedDevices(user.id);

  return <>
    <header className="topbar"><div className="shell topbar-inner"><Brand href="/guide" /><span className="meta">Signed in as {user.displayName}</span></div></header>
    <main className="shell page device-activation-page">
      <DeviceActivation initialCode={rawCode ?? ""} initialDevices={devices} />
    </main>
  </>;
}
