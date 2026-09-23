const redirectBase = new URL("https://streamtumi.invalid");

export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/dashboard";
  try {
    const parsed = new URL(value, redirectBase);
    if (parsed.origin !== redirectBase.origin) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function safeRadioNextPath(value: string | null | undefined): string {
  const path = safeNextPath(value);
  return path === "/dashboard" || path === "/guide" || path === "/account/change-password"
    || path.startsWith("/stations/") || path.startsWith("/listen/")
    ? path
    : "/dashboard";
}
