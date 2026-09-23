"use client";

import {
  weatherLocationResponseSchema,
  weatherLocationUpdateRequestSchema,
} from "@/packages/contracts/src/account";
import { FormEvent, useEffect, useState } from "react";

export function WeatherLocationForm() {
  const [weatherZipCode, setWeatherZipCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/account/weather-location", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "Weather location could not be loaded.");
        return weatherLocationResponseSchema.parse(payload);
      })
      .then((result) => { if (active) setWeatherZipCode(result.weatherZipCode ?? ""); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Weather location could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = weatherLocationUpdateRequestSchema.safeParse({ weatherZipCode: weatherZipCode || null });
    if (!parsed.success) {
      setError("Enter exactly five digits, or leave the field blank to clear it.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account/weather-location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "Weather location could not be saved.");
      const result = weatherLocationResponseSchema.parse(payload);
      setWeatherZipCode(result.weatherZipCode ?? "");
      setNotice(result.weatherZipCode ? "Weather location saved." : "Weather location cleared.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Weather location could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="card stack" onSubmit={save}>
    <div><h2>Local weather</h2><p className="meta">Set the ZIP code used for private account weather. Only the ZIP code is stored.</p></div>
    <label htmlFor="weather-zip-code">ZIP code<input id="weather-zip-code" name="weatherZipCode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="12345" disabled={loading || busy} value={weatherZipCode} onChange={(event) => setWeatherZipCode(event.target.value)} /></label>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {notice && <div className="notice notice-success" role="status">{notice}</div>}
    <div className="cluster"><button disabled={loading || busy}>{loading ? "Loading..." : busy ? "Saving..." : "Save weather location"}</button>{weatherZipCode && <button type="button" className="button-quiet" disabled={busy} onClick={() => setWeatherZipCode("")}>Clear field</button>}</div>
  </form>;
}
