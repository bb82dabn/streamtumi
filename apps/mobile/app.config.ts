import type { ConfigContext, ExpoConfig } from "expo/config";

const UNIVERSAL_LINK_PATHS = [
  { pathPrefix: "/watch/" },
  { pathPrefix: "/listen/" },
  { pathPrefix: "/verify-email" },
];

function productionValue(name: "EXPO_PUBLIC_API_ORIGIN" | "EXPO_PUBLIC_APP_HOST", fallback: string): string {
  const configured = process.env[name]?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required for production mobile builds.`);
  }
  return fallback;
}

function apiOrigin(): string {
  const value = productionValue("EXPO_PUBLIC_API_ORIGIN", "http://localhost:3000");
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

function appHost(): string {
  const value = productionValue("EXPO_PUBLIC_APP_HOST", "localhost").toLowerCase();
  const url = new URL(`https://${value}`);
  if (url.hostname !== value || url.host !== value || url.port || url.pathname !== "/") {
    throw new Error("EXPO_PUBLIC_APP_HOST must be a hostname without a scheme, port, or path.");
  }
  return value;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  apiOrigin();
  const host = appHost();
  return {
    ...config,
    name: config.name ?? "StreamTumi",
    slug: config.slug ?? "streamtumi",
    ios: {
      ...config.ios,
      associatedDomains: [`applinks:${host}`],
    },
    android: {
      ...config.android,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: UNIVERSAL_LINK_PATHS.map((path) => ({
            scheme: "https",
            host,
            ...path,
          })),
        },
      ],
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        "expo-build-properties",
        {
          ios: { deploymentTarget: "16.4" },
          android: { minSdkVersion: 29 },
        },
      ],
    ],
  };
};
