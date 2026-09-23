export const stationKinds = ["TV", "RADIO"] as const;

export type StationKind = (typeof stationKinds)[number];
export type ProgrammingMode = "LEGACY_LOOP" | "CLOCK";

export function stationManagementPath(kind: StationKind, stationId: string): string {
  void kind;
  return `/stations/${stationId}`;
}

export function stationViewerPath(kind: StationKind, token: string): string {
  return kind === "RADIO" ? `/listen/${token}` : `/watch/${token}`;
}

export function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
