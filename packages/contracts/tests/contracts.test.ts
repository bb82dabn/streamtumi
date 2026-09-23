import { describe, expect, it } from "vitest";
import {
  accountDeletionRequestSchema,
  accountDeletionResponseSchema,
  adultContentPreferenceRequestSchema,
  loginRequestSchema,
  mobileAccountSettingsResponseSchema,
  mobileCatalogSchema,
  mobileConfigSchema,
  mobilePasswordChangeRequestSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  authResponseSchema,
  emailVerificationRequestSchema,
  emailVerificationResendResponseSchema,
  emailVerificationResponseSchema,
  communityProfileResponseSchema,
    deviceActivationRequestSchema,
    deviceAuthorizationStartResponseSchema,
    deviceLoginRequestSchema,
    deviceLoginResponseSchema,
    deviceRoomCatalogStationSchema,
    deviceTokenResponseSchema,
  linkedDevicesResponseSchema,
  profileDisplayNameSchema,
  radioStationResponseSchema,
    registerRequestSchema,
    roomAccessRequestSchema,
    roomPlaybackResponseSchema,
    roomSessionRequestSchema,
  tuneHistoryClearResponseSchema,
  tvStationResponseSchema,
  weatherLocationResponseSchema,
  weatherLocationUpdateRequestSchema,
} from "../src/index";

const station = {
  id: "station-1",
  token: "public-token",
  stationKind: "TV",
  playbackKind: "SCHEDULED_TV",
  name: "Live One",
  description: "Independent TV",
  ownerName: "Host",
  genreId: "genre-1",
  genreName: "Culture",
  online: true,
  explicit: false,
  viewerCount: 12,
  fanCount: 4,
  ratingAverage: 4.5,
  ratingCount: 2,
  lastChatAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  artworkUrl: null,
  stationUrl: "https://streamtumi.com/api/public/stations/public-token",
  chatUrl: "https://streamtumi.com/api/public/stations/public-token/chat/messages",
  nowPlaying: null,
  isFeatured: false,
  isFan: false,
  viewerRating: null,
  isOwner: false,
} as const;

const metadata = {
  name: "Live One",
  description: "Independent station",
  timeZone: "UTC",
  mode: "SYNCHRONIZED",
  hasLogo: false,
  hasOfflineSlate: false,
  broadcastState: "RUNNING",
  explicit: false,
} as const;

describe("mobile contracts", () => {
  it("validates the versioned registration capability response", () => {
    expect(mobileConfigSchema.parse({ apiVersion: 1, registrationEnabled: false })).toEqual({ apiVersion: 1, registrationEnabled: false });
    expect(mobileConfigSchema.safeParse({ apiVersion: 2, registrationEnabled: true }).success).toBe(false);
    expect(mobileConfigSchema.safeParse({ apiVersion: 1, registrationEnabled: true, secret: "hidden" }).success).toBe(false);
  });

  it("accepts a mobile catalog with absolute station endpoints", () => {
    const result = mobileCatalogSchema.parse({
      apiVersion: 1,
      generatedAt: "2026-08-18T12:00:00.000Z",
      explicitIncluded: false,
      genres: [{ id: "genre-1", slug: "culture", name: "Culture", description: "Culture", explicit: false, stationCount: 1 }],
      stations: [station],
      homeSections: [{ id: "popular", kind: "POPULAR", title: "Popular now", stationIds: [station.id] }],
    });
    expect(result.stations[0]?.stationUrl).toBe(station.stationUrl);
  });

  it("rejects a relative station API endpoint", () => {
    expect(() => mobileCatalogSchema.parse({
      apiVersion: 1,
      generatedAt: "2026-08-18T12:00:00.000Z",
      explicitIncluded: false,
      genres: [],
      stations: [{ ...station, stationUrl: "/api/public/stations/public-token" }],
      homeSections: [],
    })).toThrow();
  });

  it("parses scheduled TV and continuous Radio responses", () => {
    expect(tvStationResponseSchema.parse({
      station: { ...metadata, stationKind: "TV" },
      online: false,
      serverTime: "2026-08-18T12:00:00.000Z",
      playlist: [],
    }).station.stationKind).toBe("TV");
    expect(radioStationResponseSchema.parse({
      station: { ...metadata, stationKind: "RADIO" },
      online: false,
      serverTime: "2026-08-18T12:00:00.000Z",
      playback: { kind: "RADIO_CLOCK", status: "SETUP" },
    }).playback.status).toBe("SETUP");
  });

  it("parses the safe optional Calendar runtime projection", () => {
    const parsed = tvStationResponseSchema.parse({
      station: { ...metadata, stationKind: "TV" },
      online: true,
      serverTime: "2026-08-21T12:05:00.000Z",
      calendarRuntime: {
        occurrenceRef: `cal_${"A".repeat(24)}`,
        planned: {
          title: "Town Hall",
          kind: "PROGRAM",
          startsAt: "2026-08-21T12:00:00.000Z",
          endsAt: "2026-08-21T12:30:00.000Z",
        },
        desiredSourceRole: "FALLBACK",
        actual: {
          status: "FALLBACK",
          sourceRole: "FALLBACK",
          freshAt: "2026-08-21T12:04:59.000Z",
        },
        fallbackStatus: "ACTIVE",
        nextBoundaryAt: "2026-08-21T12:30:00.000Z",
      },
      playlist: [],
    });
    expect(parsed.calendarRuntime).toMatchObject({
      occurrenceRef: `cal_${"A".repeat(24)}`,
      desiredSourceRole: "FALLBACK",
      actual: { status: "FALLBACK" },
    });
    expect(parsed.calendarRuntime).not.toHaveProperty("occurrenceId");
    expect(parsed.calendarRuntime).not.toHaveProperty("scheduleId");
  });

  it("parses additive TV delivery modes and retains transition state", () => {
    expect(tvStationResponseSchema.parse({
      station: { ...metadata, stationKind: "TV" },
      online: false,
      serverTime: "2026-08-18T12:00:00.000Z",
      delivery: { mode: "LEGACY_VOD" },
      playlist: [],
    }).delivery).toEqual({ mode: "LEGACY_VOD" });

    const channel = tvStationResponseSchema.parse({
      station: { ...metadata, stationKind: "TV", transitionMs: 1_000 },
      online: true,
      serverTime: "2026-08-18T12:00:00.000Z",
      delivery: {
        mode: "CHANNEL_HLS",
        status: "AVAILABLE",
        version: "schedule-7",
        renditionMode: "HD_ONLY",
        hlsUrl: "/api/public/stations/public-token/tv/master.m3u8",
      },
      program: {
        kind: "TV_AUTOMATION",
        itemId: "program-1",
        title: "Friday Live",
      },
      playlist: [{
        id: "program-1",
        title: "Program One",
        durationMs: 60_000,
        schedulePosition: 0,
        hlsUrl: "/api/public/stations/public-token/media/program-1/master.m3u8",
        thumbnailUrl: null,
        captionsUrl: null,
      }],
      position: {
        index: 0,
        itemId: "program-1",
        playbackOffsetMs: 59_500,
        cycleOffsetMs: 59_500,
        cycleNumber: 4,
        inTransition: true,
        transitionRemainingMs: 500,
      },
    });
    expect(channel.delivery).toMatchObject({ mode: "CHANNEL_HLS", version: "schedule-7", renditionMode: "HD_ONLY" });
    expect(tvStationResponseSchema.safeParse({
      station: { ...metadata, stationKind: "TV" },
      online: false,
      serverTime: "2026-08-18T12:00:00.000Z",
      delivery: { mode: "CHANNEL_HLS", status: "STARTING", version: "schedule-7" },
      playlist: [],
    }).success).toBe(false);
    expect(channel.program).toEqual({
      kind: "TV_AUTOMATION",
      itemId: "program-1",
      title: "Friday Live",
    });
    expect(channel.position).toMatchObject({
      cycleOffsetMs: 59_500,
      cycleNumber: 4,
      inTransition: true,
      transitionRemainingMs: 500,
    });
  });

  it("shares the backend authentication constraints", () => {
    expect(loginRequestSchema.parse({ email: " USER@EXAMPLE.COM ", password: "password" }).email).toBe("user@example.com");
    expect(registerRequestSchema.safeParse({ displayName: "Listener", email: "listener@example.com", password: "short" }).success).toBe(false);
    expect(authResponseSchema.parse({
      token: "A".repeat(43),
      accessExpiresAt: "2026-08-18T12:15:00.000Z",
      refreshToken: "R".repeat(43),
      refreshExpiresAt: "2026-09-17T12:00:00.000Z",
      user: { id: "user-1", email: "listener@example.com", displayName: "Listener", role: "USER", emailVerified: false },
    }).user.role).toBe("USER");
    expect(() => authResponseSchema.parse({
      token: "A".repeat(42),
      accessExpiresAt: "2026-08-18T12:15:00.000Z",
      refreshToken: "R".repeat(44),
      refreshExpiresAt: "2026-09-17T12:00:00.000Z",
      user: { id: "user-1", email: "listener@example.com", displayName: "Listener", role: "USER", emailVerified: false },
    })).toThrow();
    expect(emailVerificationRequestSchema.parse({ token: "V".repeat(43) }).token).toHaveLength(43);
    expect(emailVerificationRequestSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(emailVerificationResponseSchema.parse({ ok: true, verified: true }).verified).toBe(true);
    expect(emailVerificationResendResponseSchema.parse({ ok: true, message: "If an account exists..." }).ok).toBe(true);
  });

  it("validates scoped TV device activation and linked-session responses", () => {
    expect(deviceActivationRequestSchema.parse({ userCode: "ABCD-EFGH" }).userCode).toBe("ABCD-EFGH");
    expect(deviceActivationRequestSchema.safeParse({ userCode: "IO01-ABCD" }).success).toBe(false);
    expect(deviceAuthorizationStartResponseSchema.parse({
      deviceCode: "D".repeat(43),
      userCode: "ABCD-EFGH",
      verificationUri: "https://streamtumi.com/activate",
      verificationUriComplete: "https://streamtumi.com/activate?user_code=ABCD-EFGH",
      expiresIn: 600,
      interval: 5,
    }).deviceCode).toHaveLength(43);
    expect(deviceTokenResponseSchema.parse({
      deviceToken: "T".repeat(43),
      tokenType: "Device",
      expiresAt: "2027-02-14T12:00:00.000Z",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
    }).tokenType).toBe("Device");
    expect(linkedDevicesResponseSchema.parse({ devices: [{
      id: "00000000-0000-4000-8000-000000000001",
      deviceType: "ROKU",
      displayName: "Living room Roku",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
      createdAt: "2026-08-18T12:00:00.000Z",
      lastUsedAt: null,
      expiresAt: "2027-02-14T12:00:00.000Z",
      revokedAt: null,
    }] }).devices).toHaveLength(1);
  });

  it("validates direct Roku login and private room contracts", () => {
    expect(deviceLoginRequestSchema.parse({
      email: " VIEWER@EXAMPLE.COM ",
      password: "password",
      deviceType: "ROKU",
      displayName: " Living room Roku ",
    })).toMatchObject({ email: "viewer@example.com", displayName: "Living room Roku" });
    expect(deviceLoginResponseSchema.parse({
      deviceToken: "T".repeat(43),
      tokenType: "Device",
      expiresAt: "2027-02-14T12:00:00.000Z",
      scopes: ["catalog:read", "tunes:write", "rooms:join"],
      account: { displayName: "Viewer", email: "viewer@example.com" },
    }).scopes).toEqual(["catalog:read", "tunes:write", "rooms:join"]);

    expect(roomAccessRequestSchema.parse({ accessKey: "004271" }).accessKey).toBe("004271");
    expect(roomAccessRequestSchema.safeParse({ accessKey: "4271" }).success).toBe(false);
    expect(roomAccessRequestSchema.safeParse({ accessKey: "123456", password: "legacy" }).success).toBe(false);
    expect(roomSessionRequestSchema.parse({ roomSessionToken: "R".repeat(43) }).roomSessionToken).toHaveLength(43);

    const privateStation = {
      id: "00000000-0000-4000-8000-000000000001",
      stationKind: "TV",
      playbackKind: "SCHEDULED_TV",
      name: "Private room",
      description: "Invite-only programming",
      ownerName: "Owner",
      genreName: "Culture",
      online: true,
      explicit: false,
      artworkUrl: null,
      slateUrl: null,
    } as const;
    expect(roomPlaybackResponseSchema.parse({
      station: {
        ...privateStation,
        stationUrl: "https://streamtumi.com/api/public/stations/token?grant=value",
        chatUrl: "https://streamtumi.com/api/public/stations/token/chat/messages?grant=value",
        grantExpiresAt: "2026-08-21T14:00:00.000Z",
      },
      roomSessionToken: "R".repeat(43),
      membershipSaved: false,
    }).roomSessionToken).toHaveLength(43);
    expect(deviceRoomCatalogStationSchema.parse({
      ...privateStation,
      accessUrl: "https://streamtumi.com/api/device/v1/rooms/00000000-0000-4000-8000-000000000001/playback",
      relationship: "MEMBER",
    }).relationship).toBe("MEMBER");
  });

  it("validates account lifecycle requests and responses", () => {
    expect(passwordResetRequestSchema.parse({ email: " LISTENER@EXAMPLE.COM " }).email).toBe("listener@example.com");
    expect(passwordResetSchema.safeParse({ token: "T".repeat(43), newPassword: "too-short" }).success).toBe(false);
    expect(mobilePasswordChangeRequestSchema.safeParse({ currentPassword: "same-password", newPassword: "same-password" }).success).toBe(false);
    expect(adultContentPreferenceRequestSchema.safeParse({ showExplicitContent: true }).success).toBe(false);
    expect(adultContentPreferenceRequestSchema.parse({ showExplicitContent: false }).showExplicitContent).toBe(false);
    expect(accountDeletionRequestSchema.parse({ confirmationEmail: " OWNER@EXAMPLE.COM ", currentPassword: "password" }).confirmationEmail).toBe("owner@example.com");
    expect(accountDeletionRequestSchema.safeParse({ confirmationEmail: "owner@example.com" }).success).toBe(false);
    expect(accountDeletionResponseSchema.parse({ ok: true, deletionRequested: true })).toEqual({ ok: true, deletionRequested: true });
    expect(mobileAccountSettingsResponseSchema.parse({
      account: { email: "owner@example.com", showExplicitContent: false, explicitAgeAttestedAt: null, weatherZipCode: "02139" },
    }).account.email).toBe("owner@example.com");
    expect(weatherLocationUpdateRequestSchema.parse({ weatherZipCode: "02139" }).weatherZipCode).toBe("02139");
    expect(weatherLocationUpdateRequestSchema.parse({ weatherZipCode: null }).weatherZipCode).toBeNull();
    expect(weatherLocationUpdateRequestSchema.safeParse({ weatherZipCode: "１２３４５" }).success).toBe(false);
    expect(weatherLocationUpdateRequestSchema.safeParse({ weatherZipCode: "1234" }).success).toBe(false);
    expect(weatherLocationResponseSchema.parse({ weatherZipCode: "90210" }).weatherZipCode).toBe("90210");
    expect(tuneHistoryClearResponseSchema.parse({ ok: true, deleted: 4, retentionDays: 90 }).deleted).toBe(4);
  });

  it("normalizes safe profile names and rejects authority or bidi names", () => {
    expect(profileDisplayNameSchema.parse("  Casey\u00a0Owner ")).toBe("Casey Owner");
    expect(profileDisplayNameSchema.safeParse("Admin").success).toBe(false);
    expect(profileDisplayNameSchema.safeParse("Casey\u202eOwner").success).toBe(false);
    expect(communityProfileResponseSchema.parse({
      profile: { displayName: "Casey Owner", avatarUrl: "/api/community/avatars/revision/256.jpg", version: 3 },
    }).profile.version).toBe(3);
  });
});
