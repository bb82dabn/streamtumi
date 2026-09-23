import type { GuideFilters, GuideSort } from "@/lib/guide";

export type GuideSearchParams = Record<string, string | string[] | undefined>;

const guideTypes = new Set<GuideFilters["type"]>(["all", "tv", "radio"]);
const guideSorts = new Set<GuideSort>(["viewers", "rating", "fans", "chat", "newest", "name", "genre"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseGuideQuery(raw: GuideSearchParams): GuideFilters {
  const rawQuery = first(raw.q);
  const query = rawQuery?.trim() ?? "";
  const rawType = first(raw.type);
  const rawGenre = first(raw.genre);
  const rawSort = first(raw.sort);
  const rawOnAir = first(raw.onAir);
  const rawPage = first(raw.page);
  const page = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;

  return {
    q: query.length <= 100 ? query : "",
    type: rawType && guideTypes.has(rawType as GuideFilters["type"]) ? rawType as GuideFilters["type"] : "all",
    genre: rawGenre && uuid.test(rawGenre) ? rawGenre : undefined,
    sort: rawSort && guideSorts.has(rawSort as GuideSort) ? rawSort as GuideSort : "viewers",
    onAir: rawOnAir === "true",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

export function guideHref(filters: GuideFilters, changes: Partial<GuideFilters> = {}): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.type !== "all") params.set("type", next.type);
  if (next.genre) params.set("genre", next.genre);
  if (next.sort !== "viewers") params.set("sort", next.sort);
  if (next.onAir) params.set("onAir", "true");
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/guide?${query}` : "/guide";
}

export function guideTabs(filters: GuideFilters): Array<{ type: GuideFilters["type"]; label: string; href: string; current: boolean }> {
  return ([
    ["all", "All"],
    ["tv", "TV"],
    ["radio", "Radio"],
  ] as const).map(([type, label]) => ({ type, label, href: guideHref(filters, { type, page: 1 }), current: filters.type === type }));
}

export function legacyRadioGuideHref(raw: GuideSearchParams): string {
  return guideHref(parseGuideQuery(raw), { type: "radio" });
}

export function guidePagination(filters: GuideFilters, page: number, pageCount: number): { previous: string | null; next: string | null } {
  return {
    previous: page > 1 ? guideHref(filters, { page: page - 1 }) : null,
    next: page < pageCount ? guideHref(filters, { page: page + 1 }) : null,
  };
}

export function stationResourceUrl(watchUrl: string, resource: string): string {
  const origin = new URL(watchUrl).origin;
  const resolved = new URL(resource, origin);
  return new URL(`${resolved.pathname}${resolved.search}${resolved.hash}`, origin).toString();
}
