export const mobileLinkPaths = [
  "/watch/*",
  "/listen/*",
  "/verify-email",
] as const;

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
  "Surrogate-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const certificateFingerprint = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export function appleAppSiteAssociation(value = process.env.APPLE_APP_ID): object | null {
  const appId = value?.trim();
  if (!appId) return null;
  return {
    applinks: {
      apps: [],
      details: [{ appID: appId, paths: [...mobileLinkPaths] }],
    },
  };
}

export function androidAssetLinks(value = process.env.ANDROID_APP_CERT_SHA256): object[] | null {
  const fingerprints = value
    ?.split(",")
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);
  if (!fingerprints?.length || fingerprints.some((fingerprint) => !certificateFingerprint.test(fingerprint))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.streamtumi.mobile",
        sha256_cert_fingerprints: Array.from(new Set(fingerprints)),
      },
    },
  ];
}

export function mobileAssociationResponse(payload: object | object[] | null): Response {
  if (!payload) {
    return new Response(JSON.stringify({ error: "Mobile app association is unavailable." }), {
      status: 503,
      headers,
    });
  }
  return new Response(JSON.stringify(payload), { status: 200, headers });
}
