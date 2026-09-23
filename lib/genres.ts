import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type StationGenre = {
  id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  isExplicit: boolean;
  stationCount: number;
  createdAt: string;
  updatedAt: string;
};

type GenreRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  is_explicit: boolean;
  station_count: number;
  created_at: Date;
  updated_at: Date;
};

function present(row: GenreRow): StationGenre {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    active: row.active,
    isExplicit: row.is_explicit,
    stationCount: row.station_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function baseSlug(name: string): string {
  return name.toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "genre";
}

async function uniqueSlug(name: string): Promise<string> {
  const base = baseSlug(name);
  const existing = await query<{ slug: string }>("SELECT slug FROM station_genres WHERE slug = $1 OR slug LIKE $2", [base, `${base}-%`]);
  const used = new Set(existing.rows.map((row) => row.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function listGenres(activeOnly = true): Promise<StationGenre[]> {
  const result = await query<GenreRow>(
    `SELECT g.id, g.slug, g.name, g.description, g.active, g.is_explicit, g.created_at, g.updated_at,
            (SELECT count(*)::int FROM stations s WHERE s.genre_id = g.id) AS station_count
       FROM station_genres g
      ${activeOnly ? "WHERE g.active = true" : ""}
      ORDER BY g.name ASC`,
  );
  return result.rows.map(present);
}

export async function defaultGenreId(): Promise<string> {
  const result = await query<{ id: string }>(
    "SELECT id FROM station_genres WHERE active = true ORDER BY (slug = 'entertainment') DESC, name ASC LIMIT 1",
  );
  if (!result.rows[0]) throw new HttpError(409, "An administrator must add an active station genre first.", "NO_ACTIVE_GENRES");
  return result.rows[0].id;
}

export async function activeGenreId(requested?: string): Promise<string> {
  if (!requested) return defaultGenreId();
  const result = await query<{ id: string }>("SELECT id FROM station_genres WHERE id = $1 AND active = true", [requested]);
  if (!result.rows[0]) throw new HttpError(400, "Choose an active station genre.", "INVALID_GENRE");
  return result.rows[0].id;
}

export async function createGenre(name: string, description: string, isExplicit = false): Promise<StationGenre> {
  const duplicate = await query("SELECT 1 FROM station_genres WHERE lower(name) = lower($1)", [name]);
  if (duplicate.rowCount) throw new HttpError(409, "A genre with that name already exists.", "GENRE_EXISTS");
  const slug = await uniqueSlug(name);
  const result = await query<GenreRow>(
    `INSERT INTO station_genres (slug, name, description, is_explicit)
     VALUES ($1, $2, $3, $4)
     RETURNING id, slug, name, description, active, is_explicit, created_at, updated_at, 0::int AS station_count`,
    [slug, name, description, isExplicit],
  );
  return present(result.rows[0]);
}

export async function updateGenre(id: string, data: { name?: string; description?: string; active?: boolean; isExplicit?: boolean }): Promise<StationGenre> {
  if (data.name !== undefined) {
    const duplicate = await query("SELECT 1 FROM station_genres WHERE lower(name) = lower($1) AND id <> $2", [data.name, id]);
    if (duplicate.rowCount) throw new HttpError(409, "A genre with that name already exists.", "GENRE_EXISTS");
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of [["name", data.name], ["description", data.description], ["active", data.active], ["is_explicit", data.isExplicit]] as const) {
    if (value === undefined) continue;
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }
  if (!fields.length) throw new HttpError(400, "No genre changes were supplied.", "NO_CHANGES");
  values.push(id);
  const result = await query<GenreRow>(
    `UPDATE station_genres SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING id, slug, name, description, active, is_explicit, created_at, updated_at,
        (SELECT count(*)::int FROM stations s WHERE s.genre_id = station_genres.id) AS station_count`,
    values,
  );
  if (!result.rows[0]) throw new HttpError(404, "Genre not found.", "NOT_FOUND");
  return present(result.rows[0]);
}

export async function deleteGenre(id: string): Promise<void> {
  const usage = await query<{ count: number }>("SELECT count(*)::int AS count FROM stations WHERE genre_id = $1", [id]);
  if (usage.rows[0]?.count) {
    throw new HttpError(409, "This genre is assigned to stations. Archive it or reassign those stations before deleting it.", "GENRE_IN_USE");
  }
  const result = await query("DELETE FROM station_genres WHERE id = $1", [id]);
  if (!result.rowCount) throw new HttpError(404, "Genre not found.", "NOT_FOUND");
}
