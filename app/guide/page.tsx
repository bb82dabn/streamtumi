import Link from "next/link";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { StreamGuide } from "@/components/stream-guide";
import { currentUser } from "@/lib/auth";
import { listGenres } from "@/lib/genres";
import { loadGuide, type GuideFilters } from "@/lib/guide";
import { guideTabs, parseGuideQuery } from "@/lib/guide-query";
import { ExplicitContentToggle } from "@/components/explicit-content-toggle";
import { registrationEnabled } from "@/lib/registration-policy";

export const metadata = { title: "Stream Guide", description: "Browse public StreamTumi stations by genre, viewers, fans, rating, and chat activity." };
export const dynamic = "force-dynamic";

type Context = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function GuidePage({ searchParams }: Context) {
  const [raw, user, allGenres] = await Promise.all([searchParams, currentUser(), listGenres(true)]);
  const canRegister = registrationEnabled();
  const includeExplicit = Boolean(user?.showExplicitContent);
  const genres = allGenres.filter((genre) => includeExplicit || !genre.isExplicit);
  const filters: GuideFilters = parseGuideQuery(raw);
  if (filters.genre && !genres.some((genre) => genre.id === filters.genre)) filters.genre = undefined;
  const data = await loadGuide(filters, user?.id, includeExplicit);

  return <>
    <header className="topbar"><div className="shell topbar-inner"><Brand href="/guide" /><nav className="nav-actions" aria-label="Guide navigation">{user ? <><Link className="button button-quiet" href="/account/settings">Settings</Link><Link className="button button-quiet" href="/dashboard">My stations</Link><LogoutButton /></> : <><Link className={canRegister ? "button button-quiet" : "button"} href="/login?next=/guide">Sign in</Link>{canRegister && <Link className="button" href="/register?next=/guide">Create account</Link>}</>}</nav></div></header>
    <main className="shell page guide-page">
      <div className="page-header guide-page-header"><div><p className="eyebrow">Stream Guide</p><h1>Watch TV. Listen live.</h1><p className="meta">Independent programming and communities broadcasting now.</p></div>{user && <div className="cluster guide-header-actions"><ExplicitContentToggle enabled={includeExplicit} attested={Boolean(user.explicitAgeAttestedAt)} /><Link className="button button-secondary" href="/dashboard">Manage my stations</Link></div>}</div>
      <nav className="guide-tabs" aria-label="Guide station type">
        {guideTabs(filters).map((tab) => <Link key={tab.type} href={tab.href} aria-current={tab.current ? "page" : undefined}>{tab.label}</Link>)}
      </nav>
      <StreamGuide data={data} genres={genres} filters={filters} signedIn={Boolean(user)} />
    </main>
  </>;
}
