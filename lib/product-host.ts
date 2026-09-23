export type ProductHost = "MAIN";
export type ProductRouteDecision =
  | { action: "allow" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; product: ProductHost; pathname: string }
  | { action: "not-found" };

function hostname(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate.includes("://")) return candidate.startsWith("[") ? candidate.slice(1, candidate.indexOf("]")) : candidate.split(":")[0];
  try { return new URL(candidate).hostname.toLowerCase(); }
  catch { return ""; }
}

export function configuredProductHosts(): { main: string; internal: readonly string[] } {
  return {
    main: hostname(process.env.APP_URL ?? "http://localhost:3000"),
    internal: (process.env.APP_INTERNAL_HOSTS ?? "").split(",").map(hostname).filter(Boolean),
  };
}

export function productForHostname(value: string): ProductHost | null {
  const candidate = hostname(value);
  const configured = configuredProductHosts();
  if (candidate === configured.main || candidate === "localhost" || configured.internal.includes(candidate)) return "MAIN";
  return null;
}

export function isConfiguredInternalHostname(value: string): boolean {
  return configuredProductHosts().internal.includes(hostname(value));
}

export function productOrigin(product: ProductHost): string {
  void product;
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function productRouteDecision(product: ProductHost, pathname: string, method = "GET"): ProductRouteDecision {
  void product;
  void method;
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/manifest.webmanifest" || pathname.startsWith("/branding/")
    || pathname === "/.well-known/apple-app-site-association" || pathname === "/.well-known/assetlinks.json") return { action: "allow" };
  if (pathname === "/radio" || pathname === "/radio/") return { action: "redirect", product: "MAIN", pathname: "/guide?type=radio" };
  if (pathname.startsWith("/radio/")) return { action: "allow" };
  return { action: "allow" };
}
