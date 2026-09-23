import * as SecureStore from "expo-secure-store";

const AUTH_CREDENTIALS_KEY = "streamtumi.auth-credentials.v2";
const RECENT_KEY = "streamtumi.recent-stations.v1";
const RADIO_KEY = "streamtumi.paused-radio.v1";
const STATION_GRANTS_KEY = "streamtumi.station-grants.v1";
const ROOM_SESSIONS_KEY = "streamtumi.room-sessions.v1";
const authTokenPattern = /^[A-Za-z0-9_-]{43}$/;
let memoryCredentials: string | null = null;
let authOperations: Promise<void> = Promise.resolve();

export type StoredAuthCredentials = {
  token: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

async function read(key: string): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ?? (key === AUTH_CREDENTIALS_KEY ? memoryCredentials : null);
  } catch {
    return key === AUTH_CREDENTIALS_KEY ? memoryCredentials : null;
  }
}

async function write(key: string, value: string): Promise<void> {
  if (key === AUTH_CREDENTIALS_KEY) memoryCredentials = value;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

async function remove(key: string): Promise<void> {
  if (key === AUTH_CREDENTIALS_KEY) memoryCredentials = null;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

function authOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = authOperations.then(operation, operation);
  authOperations = result.then(() => undefined, () => undefined);
  return result;
}

function parseCredentials(value: string | null): StoredAuthCredentials | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const credentials = parsed as Partial<StoredAuthCredentials>;
    if (
      !authTokenPattern.test(credentials.token ?? "")
      || !authTokenPattern.test(credentials.refreshToken ?? "")
      || typeof credentials.accessExpiresAt !== "string"
      || !Number.isFinite(Date.parse(credentials.accessExpiresAt))
      || typeof credentials.refreshExpiresAt !== "string"
      || !Number.isFinite(Date.parse(credentials.refreshExpiresAt))
    ) return null;
    return credentials as StoredAuthCredentials;
  } catch {
    return null;
  }
}

export function getAuthCredentials(): Promise<StoredAuthCredentials | null> {
  return authOperation(async () => parseCredentials(await read(AUTH_CREDENTIALS_KEY)));
}

export function setAuthCredentials(credentials: StoredAuthCredentials): Promise<void> {
  return authOperation(() => write(AUTH_CREDENTIALS_KEY, JSON.stringify(credentials)));
}

export function replaceAuthCredentials(
  expectedRefreshToken: string,
  credentials: StoredAuthCredentials,
): Promise<boolean> {
  return authOperation(async () => {
    const current = parseCredentials(await read(AUTH_CREDENTIALS_KEY));
    if (current?.refreshToken !== expectedRefreshToken) return false;
    await write(AUTH_CREDENTIALS_KEY, JSON.stringify(credentials));
    return true;
  });
}

export function clearAuthCredentials(expectedRefreshToken?: string): Promise<boolean> {
  return authOperation(async () => {
    if (expectedRefreshToken) {
      const current = parseCredentials(await read(AUTH_CREDENTIALS_KEY));
      if (current?.refreshToken !== expectedRefreshToken) return false;
    }
    await remove(AUTH_CREDENTIALS_KEY);
    return true;
  });
}

export async function getRecentTokens(): Promise<string[]> {
  const value = await read(RECENT_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token): token is string => typeof token === "string" && token.length > 0).slice(0, 12);
  } catch {
    return [];
  }
}

export const setRecentTokens = (tokens: string[]): Promise<void> => write(RECENT_KEY, JSON.stringify(tokens.slice(0, 12)));
export const getPausedRadio = (): Promise<string | null> => read(RADIO_KEY);
export const setPausedRadio = (value: string): Promise<void> => write(RADIO_KEY, value);
export const clearPausedRadio = (): Promise<void> => remove(RADIO_KEY);

type StoredStationGrant = { grant: string; expiresAt: string };

async function stationGrants(): Promise<Record<string, StoredStationGrant>> {
  const value = await read(STATION_GRANTS_KEY);
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, StoredStationGrant] => {
      const grant = entry[1];
      return Boolean(
        grant
        && typeof grant === "object"
        && "grant" in grant
        && typeof grant.grant === "string"
        && "expiresAt" in grant
        && typeof grant.expiresAt === "string",
      );
    }));
  } catch {
    return {};
  }
}

export async function getStationGrant(token: string): Promise<StoredStationGrant | null> {
  const grants = await stationGrants();
  const stored = grants[token];
  if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) {
    if (stored) await clearStationGrant(token);
    return null;
  }
  return stored;
}

export async function setStationGrant(token: string, value: StoredStationGrant): Promise<void> {
  const grants = await stationGrants();
  const active = Object.entries({ ...grants, [token]: value })
    .filter(([, grant]) => new Date(grant.expiresAt).getTime() > Date.now())
    .sort((left, right) => new Date(right[1].expiresAt).getTime() - new Date(left[1].expiresAt).getTime())
    .slice(0, 8);
  await write(STATION_GRANTS_KEY, JSON.stringify(Object.fromEntries(active)));
}

export async function clearStationGrant(token: string): Promise<void> {
  const grants = await stationGrants();
  delete grants[token];
  await write(STATION_GRANTS_KEY, JSON.stringify(grants));
}

async function roomSessions(): Promise<Record<string, string>> {
  const value = await read(ROOM_SESSIONS_KEY);
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string" && authTokenPattern.test(entry[1])
    )));
  } catch {
    return {};
  }
}

export async function getRoomSession(token: string): Promise<string | null> {
  return (await roomSessions())[token] ?? null;
}

export async function setRoomSession(token: string, roomSessionToken: string): Promise<void> {
  const sessions = await roomSessions();
  const active = Object.entries({ ...sessions, [token]: roomSessionToken }).slice(-12);
  await write(ROOM_SESSIONS_KEY, JSON.stringify(Object.fromEntries(active)));
}

export async function clearRoomSession(token: string): Promise<void> {
  const sessions = await roomSessions();
  delete sessions[token];
  await write(ROOM_SESSIONS_KEY, JSON.stringify(sessions));
}
