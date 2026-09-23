import { transaction } from "@/lib/db";
import { newAccessToken } from "@/lib/stations";
import { emailSchema } from "@/lib/validation";

const stationName = "StreamTumi Weather";
const stationDescription = "Local conditions and forecasts in the classic WeatherSTAR 4000 style.";
const usage = "Usage: npm run weather:provision -- [--owner-email owner@example.com | owner@example.com]";

export function weatherChannelOwnerEmail(
  argv: string[],
  environment: { WEATHER_CHANNEL_OWNER_EMAIL?: string } = process.env as { WEATHER_CHANNEL_OWNER_EMAIL?: string },
): string {
  let argument: string | undefined;
  if (argv.length === 1 && !argv[0].startsWith("--")) argument = argv[0];
  else if (argv.length === 2 && argv[0] === "--owner-email") argument = argv[1];
  else if (argv.length) throw new Error(usage);

  const parsed = emailSchema.safeParse(argument ?? environment.WEATHER_CHANNEL_OWNER_EMAIL);
  if (!parsed.success) throw new Error(usage);
  return parsed.data;
}

export type WeatherChannelProvisioningResult = {
  stationId: string;
  ownerEmail: string;
  created: boolean;
};

export async function provisionWeatherChannel(ownerEmail: string): Promise<WeatherChannelProvisioningResult> {
  const normalizedEmail = emailSchema.parse(ownerEmail);
  return transaction(async (client) => {
    const ownerResult = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE lower(btrim(email)) = $1",
      [normalizedEmail],
    );
    const owner = ownerResult.rows[0];
    if (!owner) throw new Error(`No account exists for ${normalizedEmail}.`);

    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [owner.id]);
    const genreResult = await client.query<{ id: string }>(
      "SELECT id FROM station_genres WHERE slug = 'weather'",
    );
    const genre = genreResult.rows[0];
    if (!genre) throw new Error("The weather genre is unavailable. Run database migrations first.");

    const existingResult = await client.query<{
      id: string;
      station_kind: "TV" | "RADIO";
    }>(
       `SELECT id, station_kind
         FROM stations
        WHERE owner_id = $1 AND deleted_at IS NULL
          AND (playback_type = 'WEATHERSTAR_4000' OR name = $2)
        ORDER BY (playback_type = 'WEATHERSTAR_4000') DESC, created_at
        LIMIT 1
        FOR UPDATE`,
      [owner.id, stationName],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.station_kind !== "TV") throw new Error(`${stationName} already exists but is not a TV station.`);
      const updated = await client.query<{ id: string }>(
        `UPDATE stations
            SET name = $2, description = $3, genre_id = $4, visibility = 'PUBLIC',
                access_enabled = true, access_password_hash = NULL, access_expires_at = NULL,
                broadcast_state = 'RUNNING', stopped_at = NULL,
                playback_type = 'WEATHERSTAR_4000', updated_at = now()
          WHERE id = $1
          RETURNING id`,
        [existing.id, stationName, stationDescription, genre.id],
      );
      return {
        stationId: updated.rows[0].id,
        ownerEmail: owner.email,
        created: false,
      };
    }

    const access = newAccessToken();
    const created = await client.query<{ id: string }>(
      `INSERT INTO stations
         (owner_id, name, description, station_kind, genre_id, visibility, broadcast_state,
          playback_type, access_token_hash, access_token_ciphertext, access_token_hint)
       VALUES ($1, $2, $3, 'TV', $4, 'PUBLIC', 'RUNNING', 'WEATHERSTAR_4000', $5, $6, $7)
        RETURNING id`,
      [owner.id, stationName, stationDescription, genre.id, access.hash, access.ciphertext, access.hint],
    );
    return {
      stationId: created.rows[0].id,
      ownerEmail: owner.email,
      created: true,
    };
  });
}
