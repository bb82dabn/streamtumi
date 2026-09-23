export const weatherstarViewport = { width: 1280, height: 720 } as const;

export function weatherstarWidescreenUrl(origin: string, zipCode: string): string {
  const url = new URL(origin);
  url.searchParams.set("latLonQuery", zipCode);
  url.searchParams.set("kiosk", "true");
  url.searchParams.set("viewMode", "wide");
  url.searchParams.set("wide", "true");
  url.searchParams.set("enhanced", "false");
  url.searchParams.set("portrait", "false");
  return url.toString();
}
