import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { disableStationRoomKey, rotateStationRoomKey, stationRoomAccessState } from "@/lib/station-rooms";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    return NextResponse.json(await stationRoomAccessState(id, user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const accessKey = await rotateStationRoomKey(id, user.id);
    return NextResponse.json({ enabled: true, accessKey }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    return NextResponse.json({ enabled: false, removed: await disableStationRoomKey(id, user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
