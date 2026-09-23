import { weatherLocationUpdateRequestSchema } from "@/packages/contracts/src/account";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { getWeatherLocation, updateWeatherLocation } from "@/lib/weather-settings";

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json(await getWeatherLocation(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const data = weatherLocationUpdateRequestSchema.parse(await parseJson(request));
    return NextResponse.json(await updateWeatherLocation(user.id, data.weatherZipCode), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
