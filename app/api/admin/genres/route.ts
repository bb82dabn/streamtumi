import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createGenre, listGenres } from "@/lib/genres";
import { assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { adminGenreCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ genres: await listGenres(false) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const data = adminGenreCreateSchema.parse(await parseJson(request));
    return NextResponse.json({ genre: await createGenre(data.name, data.description, data.isExplicit) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
