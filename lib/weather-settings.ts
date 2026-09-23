import { query } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type WeatherLocation = { weatherZipCode: string | null };

function locationFromRow(row: { weather_zip_code: string | null } | undefined): WeatherLocation {
  if (!row) throw new HttpError(403, "This account is no longer active.", "ACCOUNT_INACTIVE");
  return { weatherZipCode: row.weather_zip_code };
}

export async function getWeatherLocation(userId: string): Promise<WeatherLocation> {
  const result = await query<{ weather_zip_code: string | null }>(
    `SELECT weather_zip_code FROM users
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    [userId],
  );
  return locationFromRow(result.rows[0]);
}

export async function updateWeatherLocation(userId: string, weatherZipCode: string | null): Promise<WeatherLocation> {
  const result = await query<{ weather_zip_code: string | null }>(
    `UPDATE users
        SET weather_zip_code = $2, version = version + 1, updated_at = now()
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL
      RETURNING weather_zip_code`,
    [userId, weatherZipCode],
  );
  return locationFromRow(result.rows[0]);
}
