import { NextResponse } from "next/server";
import { assertStationOwnerKind, requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { assertSameOrigin, HttpError, jsonError, parseJson } from "@/lib/http";
import { radioVisualizerPresets } from "@/lib/radio-visualizers";
import { radioVisualSettingsSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwnerKind(id, user.id, "RADIO");
    await query("INSERT INTO radio_visual_settings (station_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    const result = await query<{ mode: "COVER" | "VISUALIZER"; visualizer_id: string; version: number }>("SELECT mode, visualizer_id, version FROM radio_visual_settings WHERE station_id = $1", [id]);
    return NextResponse.json({ mode: result.rows[0].mode, visualizerId: result.rows[0].visualizer_id, version: result.rows[0].version, presets: radioVisualizerPresets });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    await assertStationOwnerKind(id, user.id, "RADIO");
    const data = radioVisualSettingsSchema.parse(await parseJson(request));
    const updated = await query<{ version: number }>(
      `UPDATE radio_visual_settings SET mode = $1, visualizer_id = $2,
              version = version + 1, updated_by_user_id = $3, updated_at = now()
        WHERE station_id = $4 AND version = $5 RETURNING version`,
      [data.mode, data.visualizerId, user.id, id, data.expectedVersion],
    );
    if (!updated.rows[0]) throw new HttpError(409, "Visual settings changed. Refresh and try again.", "VISUAL_SETTINGS_CONFLICT");
    return NextResponse.json({ version: updated.rows[0].version });
  } catch (error) {
    return jsonError(error);
  }
}
