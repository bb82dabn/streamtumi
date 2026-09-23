import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json({ error: "The submitted data is invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "An unexpected error occurred.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const appOrigin = new URL(env().APP_URL).origin;
  if (origin !== appOrigin) throw new HttpError(403, "Cross-origin request rejected.", "BAD_ORIGIN");
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Expected a JSON request body.", "INVALID_JSON");
  }
}
