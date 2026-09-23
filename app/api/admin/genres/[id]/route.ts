import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteGenre, updateGenre } from "@/lib/genres";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminGenreUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const data = adminGenreUpdateSchema.parse(await parseJson(request));
    const { id } = await context.params;
    return NextResponse.json({ genre: await updateGenre(z.string().uuid().parse(id), data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    await deleteGenre(z.string().uuid().parse(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
