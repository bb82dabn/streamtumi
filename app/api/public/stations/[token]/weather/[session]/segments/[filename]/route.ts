import { jsonError, HttpError } from "@/lib/http";
import { objectResponse } from "@/lib/media";
import { resolvePublicStation } from "@/lib/public-access";
import { assertWeatherStationRunning, requireWeatherPlaybackSession, weatherFeedObjectKey } from "@/lib/weather-playback";

type Context = { params: Promise<{ token: string; session: string; filename: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token, session: sessionToken, filename } = await context.params;
    if (!/^segment-[0-9]{1,12}\.ts$/.test(filename)) throw new HttpError(404, "Not found.", "NOT_FOUND");
    const station = await resolvePublicStation(token, request);
    if (station.playback_type !== "WEATHERSTAR_4000") throw new HttpError(404, "Not found.", "NOT_FOUND");
    assertWeatherStationRunning(station);
    const session = await requireWeatherPlaybackSession(station.id, sessionToken);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await objectResponse(weatherFeedObjectKey(session.feed_key, filename), request, "private, max-age=120");
      } catch (error) {
        if (!(error instanceof HttpError) || error.code !== "MEDIA_NOT_FOUND" || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new HttpError(404, "Media object not found.", "MEDIA_NOT_FOUND");
  } catch (error) {
    return jsonError(error);
  }
}
