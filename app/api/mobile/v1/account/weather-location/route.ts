import { weatherLocationUpdateRequestSchema } from "@/packages/contracts/src/account";
import { NextResponse } from "next/server";
import { jsonError, parseJson } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { rateLimitByKey } from "@/lib/rate-limit";
import { updateWeatherLocation } from "@/lib/weather-settings";

export async function PATCH(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    await rateLimitByKey("mobile-account-weather-location", user.id, 30, 60);
    const data = weatherLocationUpdateRequestSchema.parse(await parseJson(request));
    return NextResponse.json(await updateWeatherLocation(user.id, data.weatherZipCode), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
