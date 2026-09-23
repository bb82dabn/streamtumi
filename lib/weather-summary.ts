import { query } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { demandWeatherFeed, weatherFeedKey } from "@/lib/weather-playback";

const summaryTtlSeconds = 15 * 60;
const maximumObservationAgeMs = 2 * 60 * 60 * 1000;
const maximumFutureSkewMs = 5 * 60 * 1000;
const summaryFields = ["temperature", "condition", "high", "low", "shortForecast", "severe", "observedAt"] as const;

export type GuideWeatherSummary = {
  temperature: number;
  condition: string;
  high: number;
  low: number;
  shortForecast: string;
  severe: boolean;
  observedAt: string;
};

export type Ws4kpSummarySnapshot = {
  temperature?: unknown;
  condition?: unknown;
  high?: unknown;
  low?: unknown;
  shortForecast?: unknown;
  severe?: unknown;
  observedAt?: unknown;
};

type Ws4kpSummaryWindow = Window & {
  __streamTumiWeatherSummarySource?: Ws4kpSummarySnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTemperature(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -150 || value > 150) return null;
  return Math.round(value * 10) / 10;
}

function parseRenderedTemperature(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const match = value.match(/^\s*(-?\d{1,3}(?:\.\d)?)\s*(?:\u00b0\s*)?[FC]?\s*$/i);
  return match ? Number(match[1]) : value;
}

function normalizeWeatherText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > maximumLength || /[\u0000-\u001f\u007f<>]/.test(text)) return null;
  if (/\b\d{5}(?:-\d{4})?\b/.test(text) || /-?\d{1,3}\.\d+\s*[,/]\s*-?\d{1,3}\.\d+/.test(text)) return null;
  return text;
}

export function normalizeGuideWeatherSummary(value: unknown, nowMs = Date.now()): GuideWeatherSummary | null {
  if (!isRecord(value) || !Number.isFinite(nowMs)) return null;
  const keys = Object.keys(value);
  if (keys.length !== summaryFields.length || keys.some((key) => !summaryFields.includes(key as typeof summaryFields[number]))) return null;

  const temperature = normalizeTemperature(value.temperature);
  const high = normalizeTemperature(value.high);
  const low = normalizeTemperature(value.low);
  const condition = normalizeWeatherText(value.condition, 80);
  const shortForecast = normalizeWeatherText(value.shortForecast, 180);
  if (temperature === null || high === null || low === null || low > high || !condition || !shortForecast) return null;
  if (typeof value.severe !== "boolean" || typeof value.observedAt !== "string") return null;

  const observedAtMs = Date.parse(value.observedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.observedAt)
    || !Number.isFinite(observedAtMs)
    || observedAtMs < nowMs - maximumObservationAgeMs
    || observedAtMs > nowMs + maximumFutureSkewMs) return null;

  return {
    temperature,
    condition,
    high,
    low,
    shortForecast,
    severe: value.severe,
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

export function extractGuideWeatherSummary(value: unknown, nowMs = Date.now()): GuideWeatherSummary | null {
  if (!isRecord(value)) return null;
  return normalizeGuideWeatherSummary({
    temperature: parseRenderedTemperature(value.temperature),
    condition: value.condition,
    high: parseRenderedTemperature(value.high),
    low: parseRenderedTemperature(value.low),
    shortForecast: value.shortForecast,
    severe: value.severe,
    observedAt: value.observedAt,
  }, nowMs);
}

// Runs in the WS4KP page before its scripts. It retains only summary-safe fields from
// responses WS4KP already requested, giving DOM-version fallbacks an accurate timestamp.
export function installWs4kpSummaryCapture(): void {
  const host = window as Ws4kpSummaryWindow;
  const state: Ws4kpSummarySnapshot = {};
  Object.defineProperty(host, "__streamTumiWeatherSummarySource", { value: state, enumerable: false });
  const originalFetch = window.fetch.bind(window);
  const record = (value: unknown): value is Record<string, unknown> => (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );

  const finiteNumber = (value: unknown): number | undefined => (
    typeof value === "number" && Number.isFinite(value) ? value : undefined
  );
  const toFahrenheit = (value: unknown, unit: unknown): number | undefined => {
    const number = finiteNumber(value);
    if (number === undefined || typeof unit !== "string") return undefined;
    if (/degC$/i.test(unit)) return Math.round((number * 9 / 5 + 32) * 10) / 10;
    if (/degF$/i.test(unit) || unit === "F") return number;
    return undefined;
  };

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const response = await originalFetch(...args);
    if (!response.ok) return response;
    const input = args[0];
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    let pathname = "";
    try {
      pathname = new URL(requestUrl, window.location.href).pathname.replace(/\/$/, "");
    } catch {
      return response;
    }

    void response.clone().json().then((payload: unknown) => {
      if (!record(payload)) return;

      if (pathname.endsWith("/alerts/active")) {
        const features = Array.isArray(payload.features) ? payload.features : [];
        state.severe = features.some((feature) => {
          if (!record(feature) || !record(feature.properties)) return false;
          return typeof feature.properties.event === "string"
            && typeof feature.properties.severity === "string"
            && feature.properties.severity !== "Unknown";
        });
        return;
      }

      if (pathname.endsWith("/observations")) {
        const features = Array.isArray(payload.features) ? payload.features : [];
        const observations = features
          .map((feature) => record(feature) && record(feature.properties) ? feature.properties : null)
          .filter((properties): properties is Record<string, unknown> => Boolean(properties))
          .sort((left, right) => Date.parse(String(right.timestamp)) - Date.parse(String(left.timestamp)));
        const observation = observations[0];
        const temperature = record(observation?.temperature)
          ? toFahrenheit(observation.temperature.value, observation.temperature.unitCode)
          : undefined;
        if (temperature !== undefined) state.temperature = temperature;
        if (typeof observation?.textDescription === "string") state.condition = observation.textDescription;
        if (typeof observation?.timestamp === "string") state.observedAt = observation.timestamp;
        return;
      }

      if (!pathname.endsWith("/forecast") || !record(payload.properties) || !Array.isArray(payload.properties.periods)) return;
      const periods = payload.properties.periods
        .filter((period): period is Record<string, unknown> => record(period)
          && typeof period.isDaytime === "boolean"
          && Date.parse(String(period.endTime)) > Date.now());
      const daytimeIndex = periods.findIndex((period) => period.isDaytime === true);
      if (daytimeIndex < 0) return;
      const daytime = periods[daytimeIndex];
      const nighttime = periods.slice(daytimeIndex + 1).find((period) => period.isDaytime === false);
      const high = toFahrenheit(daytime.temperature, daytime.temperatureUnit);
      const low = nighttime ? toFahrenheit(nighttime.temperature, nighttime.temperatureUnit) : undefined;
      if (high !== undefined) state.high = high;
      if (low !== undefined) state.low = low;
      if (typeof daytime.shortForecast === "string") state.shortForecast = daytime.shortForecast;
    }).catch(() => undefined);
    return response;
  };
}

// This function is serialized into the browser by Playwright, so keep it self-contained.
export function readWs4kpSummarySnapshot(): Ws4kpSummarySnapshot {
  const host = window as Ws4kpSummaryWindow;
  const state = host.__streamTumiWeatherSummarySource ?? {};
  const firstText = (selectors: string[]): string | undefined => {
    for (const selector of selectors) {
      const text = document.querySelector<HTMLElement>(selector)?.textContent?.trim();
      if (text) return text;
    }
    return undefined;
  };

  const hazardStatus = document.querySelector("#hazards-label");
  const severeFromDom = hazardStatus?.classList.contains("press-here")
    ? Boolean(document.querySelector("#hazards-html .hazard:not(.template), #container > .scroll.hazard, #hazards-label .alert.show"))
    : undefined;
  const renderedTemperature = firstText([
    "#current-weather-html .current-weather .temp",
    "#current-weather .current-weather .temp",
    "[data-display='current-weather'] [data-field='temperature']",
    "[data-weather='temperature']",
  ]);

  return {
    temperature: state.temperature ?? renderedTemperature,
    condition: state.condition ?? firstText([
      "#current-weather-html .current-weather .condition",
      "#current-weather .current-weather .condition",
      "[data-display='current-weather'] [data-field='condition']",
      "[data-weather='condition']",
    ]),
    high: state.high ?? firstText([
      "#extended-forecast-html .day:not(.template) .value-hi",
      "#extended-forecast-html .day:not(.template) .hi .value",
      "#extended-forecast .day:not(.template) .value-hi",
      "[data-weather='high']",
    ]),
    low: state.low ?? firstText([
      "#extended-forecast-html .day:not(.template) .value-lo",
      "#extended-forecast-html .day:not(.template) .lo .value",
      "#extended-forecast .day:not(.template) .value-lo",
      "[data-weather='low']",
    ]),
    shortForecast: state.shortForecast ?? firstText([
      "#extended-forecast-html .day:not(.template) .condition",
      "#extended-forecast .day:not(.template) .condition",
      "[data-weather='short-forecast']",
    ]),
    severe: state.severe ?? severeFromDom,
    observedAt: state.observedAt,
  };
}

function summaryRedisKey(feedKey: string): string {
  return `weather:summary:${feedKey}`;
}

export async function cacheGuideWeatherSummary(feedKey: string, value: unknown, nowMs = Date.now()): Promise<boolean> {
  const summary = normalizeGuideWeatherSummary(value, nowMs);
  if (!summary) return false;
  await getRedis().set(summaryRedisKey(feedKey), JSON.stringify(summary), "EX", summaryTtlSeconds);
  return true;
}

export async function getGuideWeatherSummaryForOwner(ownerId: string): Promise<GuideWeatherSummary | null> {
  try {
    const result = await query<{ weather_zip_code: string | null }>(
      `SELECT weather_zip_code FROM users
        WHERE id = $1 AND disabled_at IS NULL
          AND deletion_requested_at IS NULL AND anonymized_at IS NULL`,
      [ownerId],
    );
    const zipCode = result.rows[0]?.weather_zip_code;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) return null;

    const feedKey = weatherFeedKey(zipCode);
    await demandWeatherFeed(feedKey, zipCode).catch(() => undefined);
    const cached = await getRedis().get(summaryRedisKey(feedKey));
    if (!cached) return null;
    try {
      return normalizeGuideWeatherSummary(JSON.parse(cached));
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
