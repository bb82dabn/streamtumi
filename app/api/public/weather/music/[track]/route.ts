import { env } from "@/lib/env";
import { HttpError, jsonError } from "@/lib/http";

const tracks: Record<string, string> = {
  "catch-the-sun": "Catch the Sun.mp3",
  "crisp-day": "Crisp day.mp3",
  "rolling-clouds": "Rolling Clouds.mp3",
  "strong-breeze": "Strong Breeze.mp3",
};

type Context = { params: Promise<{ track: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { track } = await context.params;
    const filename = tracks[track];
    if (!filename) throw new HttpError(404, "Weather music not found.", "NOT_FOUND");
    const response = await fetch(new URL(`/music/default/${filename}`, env().WEATHERSTAR_URL), { cache: "no-store" });
    if (!response.ok || !response.body) throw new HttpError(502, "Weather music is unavailable.", "WEATHER_MUSIC_UNAVAILABLE");
    const contentLength = response.headers.get("content-length");
    return new Response(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
