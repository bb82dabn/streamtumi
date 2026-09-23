import { createHmac } from "node:crypto";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import { getWeatherRenderQueue } from "@/lib/queue";
import { getRedis } from "@/lib/redis";
import type { PublicStation } from "@/lib/public-access";
import type { PersonalizedWeatherPlayback } from "@/packages/contracts/src/playback";

const playbackTtlSeconds = 2 * 60 * 60;

type WeatherSessionRow = {
  id: string;
  user_id: string;
  station_id: string;
  feed_key: string;
  zip_code: string;
  expires_at: Date;
};

export function assertWeatherStationRunning(station: PublicStation): void {
  if (station.playback_type !== "WEATHERSTAR_4000") return;
  if (station.broadcast_state !== "RUNNING") {
    throw new HttpError(409, "StreamTumi Weather is currently off air.", "WEATHER_STATION_OFFLINE");
  }
}

function weatherSessionToken(userId: string, stationId: string, tuneId: string): string {
  return createHmac("sha256", env().APP_SECRET)
    .update(`weather-playback:v1:${userId}:${stationId}:${tuneId}`)
    .digest("base64url");
}

export function weatherFeedKey(zipCode: string): string {
  return createHmac("sha256", env().APP_SECRET)
    .update(`weather-feed:v1:${zipCode}`)
    .digest("hex");
}

function weatherHlsUrl(stationToken: string, sessionToken: string): string {
  return new URL(
    `/api/public/stations/${encodeURIComponent(stationToken)}/weather/${encodeURIComponent(sessionToken)}/master.m3u8`,
    env().APP_URL,
  ).toString();
}

export async function issueWeatherPlayback(
  userId: string,
  station: PublicStation,
  stationToken: string,
  tuneId: string,
): Promise<PersonalizedWeatherPlayback | undefined> {
  if (station.playback_type !== "WEATHERSTAR_4000") return undefined;
  assertWeatherStationRunning(station);
  const location = await query<{ weather_zip_code: string | null }>(
    `SELECT weather_zip_code FROM users
      WHERE id = $1 AND disabled_at IS NULL
        AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
    [userId],
  );
  const zipCode = location.rows[0]?.weather_zip_code;
  if (!zipCode) {
    throw new HttpError(409, "Set your ZIP code in account settings before watching StreamTumi Weather.", "WEATHER_LOCATION_REQUIRED");
  }

  const token = weatherSessionToken(userId, station.id, tuneId);
  const feedKey = weatherFeedKey(zipCode);
  const expiresAt = new Date(Date.now() + playbackTtlSeconds * 1000);
  const result = await query<WeatherSessionRow>(
    `INSERT INTO weather_playback_sessions
       (tune_id, token_hash, user_id, station_id, zip_code, feed_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, station_id, tune_id) DO UPDATE
        SET token_hash = EXCLUDED.token_hash,
            zip_code = EXCLUDED.zip_code,
            feed_key = EXCLUDED.feed_key,
            expires_at = CASE
              WHEN weather_playback_sessions.expires_at > now() THEN weather_playback_sessions.expires_at
              ELSE EXCLUDED.expires_at
            END,
            updated_at = now()
     RETURNING id, station_id, feed_key, zip_code, expires_at`,
    [tuneId, hashToken(token), userId, station.id, zipCode, feedKey, expiresAt],
  );
  const session = result.rows[0];
  await demandWeatherFeed(session.feed_key, session.zip_code);
  return {
    kind: "PERSONALIZED_HLS",
    provider: "WS4KP",
    sessionId: session.id,
    hlsUrl: weatherHlsUrl(stationToken, token),
    expiresAt: session.expires_at.toISOString(),
    displayMode: "WIDESCREEN_16_9",
  };
}

export async function demandWeatherFeed(feedKey: string, zipCode?: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`weather:demand:${feedKey}`, String(Date.now()), "EX", env().WEATHER_RENDER_IDLE_SECONDS);
  if (zipCode) {
    if (!(await redis.exists("health:worker:weather-ready"))) {
      throw new HttpError(503, "The Weather renderer is temporarily unavailable.", "WEATHER_RENDERER_UNAVAILABLE");
    }
    const acquired = await redis.set(`weather:enqueue:${feedKey}`, "1", "EX", 5, "NX");
    if (!acquired) return;
    const queue = getWeatherRenderQueue();
    const existing = await queue.getJob(feedKey);
    const state = await existing?.getState();
    if (existing && state === "failed") {
      const failure = await redis.hmget(`weather:feed:${feedKey}`, "failureCount", "nextRetryAt");
      if (Number(failure[0] ?? 0) >= 6 || Number(failure[1] ?? 0) > Date.now()) return;
      await existing.retry();
      return;
    }
    if (existing && state === "completed") await existing.remove();
    if (existing && state !== "completed") return;
    await queue.add(
      "render-weather",
      { feedKey, zipCode },
      { jobId: feedKey },
    );
  }
}

export async function weatherFeedIsFresh(feedKey: string, nowMs = Date.now()): Promise<boolean> {
  const state = await getRedis().hmget(`weather:feed:${feedKey}`, "status", "updatedAt", "playlistAdvancedAt");
  return state[0] === "RUNNING"
    && Number.isFinite(Number(state[1]))
    && Number(state[1]) >= nowMs - 15_000
    && Number.isFinite(Number(state[2]))
    && Number(state[2]) >= nowMs - 15_000;
}

export async function waitForWeatherFeed(feedKey: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await weatherFeedIsFresh(feedKey)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return weatherFeedIsFresh(feedKey);
}

export async function requireWeatherPlaybackSession(
  stationId: string,
  sessionToken: string,
): Promise<WeatherSessionRow> {
  const result = await query<WeatherSessionRow>(
    `SELECT session.id, session.user_id, session.station_id, session.feed_key,
            session.zip_code, session.expires_at
       FROM weather_playback_sessions session
       JOIN users u ON u.id = session.user_id
      WHERE session.token_hash = $1 AND session.station_id = $2
        AND session.expires_at > now()
        AND u.disabled_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
        AND u.weather_zip_code = session.zip_code`,
    [hashToken(sessionToken), stationId],
  );
  const session = result.rows[0];
  if (!session) throw new HttpError(404, "This weather playback session is unavailable or expired.", "WEATHER_SESSION_UNAVAILABLE");
  await demandWeatherFeed(session.feed_key, session.zip_code);
  return session;
}

export function weatherFeedObjectKey(feedKey: string, filename: string): string {
  return `weather/feeds/${feedKey}/${filename}`;
}
