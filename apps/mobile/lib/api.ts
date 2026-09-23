import { apiErrorSchema, authResponseSchema, type AuthResponse, type MobileUser } from "@streamtumi/contracts";
import type { ZodType } from "zod";
import {
  clearAuthCredentials,
  getAuthCredentials,
  replaceAuthCredentials,
  type StoredAuthCredentials,
} from "@/lib/storage";

const configuredOrigin = process.env.EXPO_PUBLIC_API_ORIGIN?.trim();

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash
  ) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be an HTTP(S) origin without a path, query, or credentials.");
  }
  return url.origin;
}

if (!configuredOrigin && process.env.NODE_ENV === "production") {
  throw new Error("EXPO_PUBLIC_API_ORIGIN is required for production mobile builds.");
}

export const API_ORIGIN = normalizeOrigin(configuredOrigin || "http://localhost:3000");
let refreshAttempt: Promise<boolean> | null = null;
const authListeners = new Set<(user: MobileUser | null) => void>();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function absoluteUrl(value: string, base = API_ORIGIN): string {
  return new URL(value, `${base.replace(/\/$/, "")}/`).toString();
}

export function withQueryParameter(value: string, name: string, parameter: string): string {
  const url = new URL(value, `${API_ORIGIN}/`);
  url.searchParams.set(name, parameter);
  return url.toString();
}

function storedCredentials(result: AuthResponse): StoredAuthCredentials {
  return {
    token: result.token,
    accessExpiresAt: result.accessExpiresAt,
    refreshToken: result.refreshToken,
    refreshExpiresAt: result.refreshExpiresAt,
  };
}

function notifyAuthListeners(user: MobileUser | null): void {
  for (const listener of authListeners) listener(user);
}

export function subscribeMobileAuth(listener: (user: MobileUser | null) => void): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function isMobileAuthEndpoint(path: string): boolean {
  return new URL(path, `${API_ORIGIN}/`).pathname.startsWith("/api/mobile/v1/auth/");
}

function errorFromResponse(response: Response, payload: unknown): ApiError {
  const parsedError = apiErrorSchema.safeParse(payload);
  return new ApiError(
    parsedError.success ? parsedError.data.error : `Request failed (${response.status}).`,
    response.status,
    parsedError.success ? parsedError.data.code : undefined,
  );
}

async function fetchJson(path: string, init: RequestInit, token: string | null) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-StreamTumi-Product", "MAIN");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  const response = await fetch(absoluteUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
  return { response, payload: await response.json().catch(() => null) as unknown };
}

async function performRefresh(): Promise<boolean> {
  const credentials = await getAuthCredentials();
  if (!credentials) return false;

  try {
    if (Date.parse(credentials.refreshExpiresAt) <= Date.now()) {
      throw new ApiError("Your session has expired. Sign in again.", 401, "REFRESH_TOKEN_INVALID");
    }
    const { response, payload } = await fetchJson(
      "/api/mobile/v1/auth/refresh",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: credentials.refreshToken }),
      },
      null,
    );
    if (!response.ok) throw errorFromResponse(response, payload);
    const parsed = authResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError("StreamTumi returned an unexpected response.", response.status, "INVALID_RESPONSE");
    }
    const replaced = await replaceAuthCredentials(credentials.refreshToken, storedCredentials(parsed.data));
    if (replaced) notifyAuthListeners(parsed.data.user);
    return replaced;
  } catch (error) {
    const terminal = error instanceof ApiError && (
      error.status === 400
      || error.status === 401
      || error.status === 403
      || error.code === "INVALID_RESPONSE"
    );
    if (terminal && await clearAuthCredentials(credentials.refreshToken)) notifyAuthListeners(null);
    throw error;
  }
}

async function refreshOnce(): Promise<boolean> {
  if (!refreshAttempt) {
    refreshAttempt = performRefresh().finally(() => {
      refreshAttempt = null;
    });
  }
  return refreshAttempt;
}

export async function refreshMobileAccessToken(): Promise<void> {
  if (!await refreshOnce()) {
    throw new ApiError("Sign in is required.", 401, "UNAUTHENTICATED");
  }
}

export async function ensureFreshMobileAccessToken(): Promise<void> {
  const credentials = await getAuthCredentials();
  if (credentials && Date.parse(credentials.accessExpiresAt) <= Date.now() + 30_000) {
    await refreshMobileAccessToken();
  }
}

export async function requestJson<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const credentials = await getAuthCredentials();
  let { response, payload } = await fetchJson(path, init, credentials?.token ?? null);
  if (response.status === 401 && !isMobileAuthEndpoint(path) && await refreshOnce()) {
    const replacement = await getAuthCredentials();
    ({ response, payload } = await fetchJson(path, init, replacement?.token ?? null));
  }
  if (!response.ok) {
    throw errorFromResponse(response, payload);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("StreamTumi returned an unexpected response.", response.status, "INVALID_RESPONSE");
  }
  return parsed.data;
}

export function jsonRequest(body: unknown, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return { ...init, headers, body: JSON.stringify(body) };
}
