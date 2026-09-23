import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  mobileStationAccessSchema,
  mobileStationResolveSchema,
  roomPlaybackResponseSchema,
  stationResponseSchema,
  type CatalogStation,
  type MobileStationResolve,
  type PersonalizedWeatherPlayback,
  type RadioStationResponse,
  type StationResponse,
  type TvStationResponse,
} from "@streamtumi/contracts";
import { z } from "zod";
import { ChatPanel } from "@/components/ChatPanel";
import { RadioPlayer } from "@/components/RadioPlayer";
import { ReportModal } from "@/components/ReportModal";
import { ScreenState } from "@/components/ScreenState";
import { TvPlayer } from "@/components/TvPlayer";
import { ApiError, jsonRequest, requestJson, withQueryParameter } from "@/lib/api";
import { clearRoomSession, clearStationGrant, getRoomSession, getStationGrant, setStationGrant } from "@/lib/storage";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useHistory } from "@/providers/HistoryProvider";

type DetailTab = "NOW" | "CHAT" | "DETAILS";
const tuneResponseSchema = z.object({
  tune: z.object({
    id: z.string().uuid(),
    stationId: z.string().uuid(),
    client: z.literal("MOBILE"),
    tunedAt: z.string().datetime(),
  }),
  playback: z.object({
    kind: z.literal("PERSONALIZED_HLS"),
    provider: z.literal("WS4KP"),
    sessionId: z.string().uuid(),
    hlsUrl: z.string().url(),
    expiresAt: z.string().datetime(),
    displayMode: z.literal("WIDESCREEN_16_9"),
  }).optional(),
});

export default function StationScreen() {
  const params = useLocalSearchParams<{ token: string | string[]; source?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const { session } = useAuth();
  const { catalog, loading: catalogLoading, error: catalogError, refresh: refreshCatalog } = useCatalog();
  const { rememberStation } = useHistory();
  const catalogStation = catalog?.stations.find((item) => item.token === token);
  const [resolved, setResolved] = useState<MobileStationResolve | null>(null);
  const [resolving, setResolving] = useState(true);
  const [resolutionError, setResolutionError] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState("");
  const station = catalogStation ?? (token && resolved ? stationFromResolved(token, resolved) : undefined);
  const [state, setState] = useState<StationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [weatherPlayback, setWeatherPlayback] = useState<PersonalizedWeatherPlayback | null>(null);
  const [weatherLocationRequired, setWeatherLocationRequired] = useState(false);
  const [tab, setTab] = useState<DetailTab>("NOW");
  const [reportOpen, setReportOpen] = useState(false);
  const stationUrl = station?.stationUrl;
  const playbackStationUrl = stationUrl && grant ? withQueryParameter(stationUrl, "grant", grant) : stationUrl;
  const stationKind = station?.stationKind;
  const stationToken = station?.token;

  async function renewRoomGrant(targetToken: string): Promise<{ grant: string; expiresAt: string } | null> {
    const roomSessionToken = await getRoomSession(targetToken);
    if (!roomSessionToken) return null;
    try {
      const room = await requestJson(
        "/api/mobile/v1/rooms/session",
        roomPlaybackResponseSchema,
        jsonRequest({ roomSessionToken }, { method: "POST" }),
      );
      const url = new URL(room.station.stationUrl);
      const grant = url.searchParams.get("grant");
      const match = /^\/api\/public\/stations\/([^/]+)$/.exec(url.pathname);
      const encodedToken = match?.[1];
      if (!grant || !encodedToken || decodeURIComponent(encodedToken) !== targetToken) throw new Error("The saved room returned an invalid playback link.");
      const access = { grant, expiresAt: room.station.grantExpiresAt };
      await setStationGrant(targetToken, access);
      return access;
    } catch (caught) {
      if (caught instanceof ApiError && ["ROOM_SESSION_INVALID", "ROOM_UNAVAILABLE"].includes(caught.code ?? "")) {
        await clearRoomSession(targetToken);
        await clearStationGrant(targetToken);
      }
      return null;
    }
  }

  async function provisionWeatherPlayback() {
    if (!stationToken || !session) return;
    const tuned = await requestJson(
      "/api/mobile/v1/tunes",
      tuneResponseSchema,
      jsonRequest({ id: randomUUID(), stationToken }, { method: "POST" }),
    );
    if (!tuned.playback) throw new Error("The weather service did not return a playback stream.");
    setWeatherLocationRequired(false);
    setWeatherPlayback(tuned.playback);
    await refreshCatalog();
  }

  async function resolveStation() {
    if (!token) {
      setResolutionError("This station link is incomplete.");
      setResolving(false);
      return;
    }
    if (catalogStation) {
      setResolved(null);
      setGrant(null);
      setResolutionError("");
      setResolving(false);
      return;
    }
    setResolving(true);
    try {
      const result = await requestJson(
        `/api/mobile/v1/stations/${encodeURIComponent(token)}/resolve`,
        mobileStationResolveSchema,
        { cache: "no-store" },
      );
      let stored = result.requiresPassword || result.requiresAccessKey ? await getStationGrant(token) : null;
      if (result.requiresAccessKey && !stored) {
        stored = await renewRoomGrant(token);
      }
      setResolved(result);
      setGrant(stored?.grant ?? null);
      setResolutionError("");
    } catch (caught) {
      setResolved(null);
      setResolutionError(caught instanceof Error ? caught.message : "This station link is unavailable.");
    } finally {
      setResolving(false);
    }
  }

  const resolveFromEffect = useEffectEvent(resolveStation);
  useEffect(() => {
    if (catalogLoading) return;
    const pending = setTimeout(() => void resolveFromEffect(), 0);
    return () => clearTimeout(pending);
  }, [catalogLoading, catalogStation?.id, token]);

  async function load(silent = false) {
    if (!station || !playbackStationUrl) return;
    if (!silent) setLoading(true);
    try {
      const result = await requestJson(playbackStationUrl, stationResponseSchema, { cache: "no-store" });
      if (result.station.stationKind !== station.stationKind) throw new Error("This station changed broadcast type. Refresh the guide.");
      setState(result);
      setError("");
      if (result.station.playbackKind === "PERSONALIZED_WEATHER" && !weatherPlayback && stationToken && session) {
        await provisionWeatherPlayback();
      }
    } catch (caught) {
      if (caught instanceof ApiError) setWeatherLocationRequired(caught.code === "WEATHER_LOCATION_REQUIRED");
      if (caught instanceof ApiError && ["PASSWORD_REQUIRED", "ACCESS_KEY_REQUIRED"].includes(caught.code ?? "") && stationToken) {
        if (caught.code === "ACCESS_KEY_REQUIRED") {
          const renewed = await renewRoomGrant(stationToken);
          if (renewed) {
            setGrant(renewed.grant);
            setError("");
            return;
          }
        }
        await clearStationGrant(stationToken);
        setGrant(null);
        setState(null);
      }
      setError(caught instanceof Error ? caught.message : "The station could not be opened.");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }

  const loadFromEffect = useEffectEvent(load);
  const renewWeatherFromEffect = useEffectEvent(provisionWeatherPlayback);
  const recordTuneFromEffect = useEffectEvent(async () => {
    if (!stationToken) return;
    if (!session) {
      rememberStation(stationToken);
      return;
    }
    try {
      await requestJson(
        "/api/mobile/v1/tunes",
        tuneResponseSchema,
        jsonRequest({ id: randomUUID(), stationToken }, { method: "POST" }),
      );
      await refreshCatalog();
    } catch {
      // Private and owner stations intentionally do not contribute to recommendation history.
    }
  });

  useEffect(() => {
    if (!playbackStationUrl || !stationKind || ((resolved?.requiresPassword || resolved?.requiresAccessKey) && !grant)) return;
    const initial = setTimeout(() => void loadFromEffect(), 0);
    const poll = setInterval(() => void loadFromEffect(true), stationKind === "RADIO" ? 6_000 : 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [grant, playbackStationUrl, resolved?.requiresAccessKey, resolved?.requiresPassword, stationKind]);

  useEffect(() => {
    if (!weatherPlayback?.expiresAt) return;
    const renewInMs = Math.max(1_000, new Date(weatherPlayback.expiresAt).getTime() - Date.now() - 5 * 60_000);
    const timer = setTimeout(() => void renewWeatherFromEffect().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Your local weather feed could not be renewed.");
    }), renewInMs);
    return () => clearTimeout(timer);
  }, [weatherPlayback?.expiresAt]);

  useEffect(() => {
    if (!stationToken || !state?.online || state.station.playbackKind === "PERSONALIZED_WEATHER") return;
    const tune = setTimeout(() => void recordTuneFromEffect(), 30_000);
    return () => clearTimeout(tune);
  }, [state?.online, state?.station.playbackKind, stationToken]);

  async function unlockStation() {
    if (!token || !password.trim()) return;
    setAccessBusy(true);
    setAccessError("");
    try {
      const result = await requestJson(
        `/api/mobile/v1/stations/${encodeURIComponent(token)}/access`,
        mobileStationAccessSchema,
        jsonRequest(resolved?.requiresAccessKey ? { accessKey: password } : { password }, { method: "POST" }),
      );
      await setStationGrant(token, result);
      setGrant(result.grant);
      setPassword("");
    } catch (caught) {
      setAccessError(caught instanceof Error ? caught.message : "The station could not be unlocked.");
    } finally {
      setAccessBusy(false);
    }
  }

  if ((catalogLoading && !catalog) || resolving) return <SafeAreaView style={styles.safe}><ScreenState loading title="Finding station" message="Looking up the secure broadcast endpoint." /></SafeAreaView>;
  if (!station) return <SafeAreaView style={styles.safe}><TopBar /><ScreenState title="Station unavailable" message={resolutionError || catalogError || "This station link is unavailable."} actionLabel="Try again" onAction={() => void resolveStation()} /></SafeAreaView>;
  if ((resolved?.requiresPassword || resolved?.requiresAccessKey) && !grant) return <AccessGate accessKey={Boolean(resolved.requiresAccessKey)} busy={accessBusy} error={accessError} onChange={setPassword} onSubmit={() => void unlockStation()} password={password} station={station} />;
  if (loading && !state) return <SafeAreaView style={styles.safe}><TopBar /><ScreenState loading title={`Opening ${station.name}`} message="Synchronizing with the live broadcast." /></SafeAreaView>;
  if (!state) return <SafeAreaView style={styles.safe}><TopBar /><ScreenState title="Station unavailable" message={error} actionLabel="Try again" onAction={() => void load()} /></SafeAreaView>;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <TopBar station={station} refreshing={refreshing} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          <View style={[styles.kindIcon, station.stationKind === "RADIO" && styles.radioIcon]}>
            <Ionicons name={station.stationKind === "TV" ? "tv" : "radio"} size={19} color={station.stationKind === "TV" ? colors.accent : colors.radio} />
          </View>
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.stationName}>{station.name}</Text>
            <Text numberOfLines={1} style={styles.stationMeta}>{station.genreName} / by {station.ownerName}</Text>
          </View>
          <View style={[styles.onAir, !state.online && styles.offAir]}><Text style={styles.onAirText}>{state.online ? "ON AIR" : "OFF AIR"}</Text></View>
        </View>
        <View style={styles.tabs}>
          <TabButton active={tab === "NOW"} label="Now Playing" onPress={() => setTab("NOW")} />
          <TabButton active={tab === "CHAT"} label="Chat" onPress={() => setTab("CHAT")} />
          <TabButton active={tab === "DETAILS"} label="Details" onPress={() => setTab("DETAILS")} />
        </View>
        {error ? <View style={styles.refreshError}><Text style={styles.refreshErrorText}>{error}</Text>{weatherLocationRequired ? <Pressable onPress={() => router.push("/settings")}><Text style={styles.noticeLink}>Set ZIP code</Text></Pressable> : null}</View> : null}
        {tab === "NOW" ? <NowPlaying station={station} state={state} stationUrl={playbackStationUrl ?? station.stationUrl} weatherPlayback={weatherPlayback} /> : null}
        {tab === "CHAT" ? <ChatPanel grant={grant} station={station} /> : null}
        {tab === "DETAILS" ? <Details onReport={() => setReportOpen(true)} station={station} state={state} /> : null}
      </ScrollView>
      <ReportModal
        grant={grant}
        onClose={() => setReportOpen(false)}
        stationToken={station.token}
        subject={{ type: "STATION", context: station.name }}
        visible={reportOpen}
      />
    </SafeAreaView>
  );
}

function stationFromResolved(token: string, station: MobileStationResolve): CatalogStation {
  return {
    id: `link:${token}`,
    token,
    stationKind: station.stationKind,
    playbackKind: station.playbackKind,
    name: station.name,
    description: station.description,
    ownerName: "Unlisted broadcaster",
    genreId: "unlisted",
    genreName: "Private link",
    online: station.broadcastState === "RUNNING",
    explicit: station.explicit,
    viewerCount: 0,
    fanCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
    lastChatAt: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    artworkUrl: null,
    stationUrl: station.stationUrl,
    chatUrl: `${station.stationUrl}/chat/messages`,
    nowPlaying: null,
    isFeatured: false,
    isFan: false,
    viewerRating: null,
    isOwner: false,
  };
}

function AccessGate({ accessKey, busy, error, onChange, onSubmit, password, station }: {
  accessKey: boolean;
  busy: boolean;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  password: string;
  station: CatalogStation;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <TopBar station={station} />
      <View style={styles.accessGate}>
        <View style={styles.accessIcon}><Ionicons name="lock-closed" size={30} color={colors.accent} /></View>
        <Text style={styles.accessTitle}>Private broadcast</Text>
        <Text style={styles.bodyCopy}>Enter the {accessKey ? "six-digit room key" : "password"} supplied by {station.name} to watch or listen on this device.</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          keyboardType={accessKey ? "number-pad" : "default"}
          maxLength={accessKey ? 6 : 128}
          placeholder={accessKey ? "Room key" : "Station password"}
          placeholderTextColor={colors.faint}
          secureTextEntry={!accessKey}
          style={styles.accessInput}
          value={password}
        />
        {error ? <Text style={styles.accessError}>{error}</Text> : null}
        <Pressable disabled={busy || (accessKey ? !/^\d{6}$/.test(password) : !password.trim())} onPress={onSubmit} style={[styles.accessButton, (busy || (accessKey ? !/^\d{6}$/.test(password) : !password.trim())) && styles.accessButtonDisabled]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.accessButtonText}>Unlock station</Text>}
        </Pressable>
        <Text style={styles.accessNote}>Access is stored securely until the server grant expires.</Text>
      </View>
    </SafeAreaView>
  );
}

function TopBar({ station, refreshing }: { station?: CatalogStation; refreshing?: boolean }) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} style={styles.back}>
        <Ionicons name="chevron-back" size={23} color={colors.text} />
      </Pressable>
      <Text numberOfLines={1} style={styles.topTitle}>{station?.stationKind === "RADIO" ? "Listen live" : station ? "Watch live" : "StreamTumi"}</Text>
      <View style={styles.topStatus}>{refreshing ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="radio-outline" size={20} color={colors.faint} />}</View>
    </View>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>;
}

function NowPlaying({ station, state, stationUrl, weatherPlayback }: { station: CatalogStation; state: StationResponse; stationUrl: string; weatherPlayback: PersonalizedWeatherPlayback | null }) {
  if (station.stationKind === "TV" && isTvState(state)) {
    return (
      <View>
        <TvPlayer state={state} stationUrl={stationUrl} weatherPlayback={weatherPlayback} />
        <TvSchedule state={state} />
      </View>
    );
  }
  if (station.stationKind === "RADIO" && isRadioState(state)) return <RadioPlayer station={station} state={state} stationUrl={stationUrl} />;
  return <ScreenState title="Broadcast changed" message="Refresh the Stream Guide to reopen this station." />;
}

function isTvState(state: StationResponse): state is TvStationResponse {
  return state.station.stationKind === "TV";
}

function isRadioState(state: StationResponse): state is RadioStationResponse {
  return state.station.stationKind === "RADIO";
}

function TvSchedule({ state }: { state: TvStationResponse }) {
  const currentIndex = state.position?.index ?? -1;
  const upcoming = state.playlist.filter((_, index) => index !== currentIndex).slice(0, 3);
  return (
    <View style={styles.schedule}>
      <Text style={styles.sectionKicker}>Coming up</Text>
      {upcoming.length ? upcoming.map((item, index) => (
        <View key={item.id} style={styles.scheduleRow}>
          <Text style={styles.scheduleNumber}>{String(index + 1).padStart(2, "0")}</Text>
          <View style={styles.identityCopy}><Text numberOfLines={1} style={styles.scheduleTitle}>{item.title}</Text><Text style={styles.scheduleMeta}>{Math.max(1, Math.round(item.durationMs / 60_000))} min</Text></View>
        </View>
      )) : <Text style={styles.bodyCopy}>The station has not published its next program.</Text>}
    </View>
  );
}

function Details({ onReport, station, state }: { onReport: () => void; station: CatalogStation; state: StationResponse }) {
  return (
    <View style={styles.details}>
      <Text style={styles.sectionKicker}>About this station</Text>
      <Text style={styles.detailsTitle}>{station.name}</Text>
      <Text style={styles.bodyCopy}>{station.description || "An independent live station on StreamTumi."}</Text>
      <View style={styles.metrics}>
        <Metric value={String(station.viewerCount)} label={station.stationKind === "RADIO" ? "listeners" : "viewers"} />
        <Metric value={String(station.fanCount)} label="fans" />
        <Metric value={station.ratingCount ? station.ratingAverage.toFixed(1) : "New"} label="rating" />
      </View>
      <View style={styles.infoCard}>
        <InfoRow icon="person-outline" label="Broadcaster" value={station.ownerName} />
        <InfoRow icon="pricetag-outline" label="Genre" value={station.genreName} />
        <InfoRow icon="time-outline" label="Time zone" value={state.station.timeZone} />
        <InfoRow icon="repeat-outline" label="Playback" value={station.playbackKind === "CONTINUOUS_RADIO" ? "Continuous Radio" : "Synchronized TV"} />
      </View>
      <Pressable onPress={onReport} style={styles.reportButton}>
        <Ionicons name="flag-outline" size={17} color={colors.muted} />
        <Text style={styles.reportButtonText}>Report station</Text>
      </Pressable>
    </View>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.infoRow}><Ionicons name={icon} size={17} color={colors.faint} /><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={1} style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 150 },
  topBar: { height: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  back: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  topTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  topStatus: { width: 40, alignItems: "center" },
  accessGate: { flex: 1, justifyContent: "center", padding: 28, gap: 14 },
  accessIcon: { width: 64, height: 64, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5c2c23", marginBottom: 4 },
  accessTitle: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  accessInput: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.panel, color: colors.text, fontSize: 15, paddingHorizontal: 15, marginTop: 8 },
  accessError: { color: "#ff9584", fontSize: 12, lineHeight: 18, backgroundColor: "#2b1110", borderRadius: 10, padding: 10 },
  accessButton: { minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  accessButtonDisabled: { opacity: 0.48 },
  accessButtonText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  accessNote: { color: colors.faint, fontSize: 11, lineHeight: 17, textAlign: "center" },
  identity: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16 },
  kindIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#351a15", alignItems: "center", justifyContent: "center" },
  radioIcon: { backgroundColor: "#10322f" },
  identityCopy: { flex: 1, minWidth: 0 },
  stationName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  stationMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  onAir: { backgroundColor: colors.accent, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  offAir: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  onAirText: { color: colors.white, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 13, padding: 4, borderRadius: 14, backgroundColor: colors.panel },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  tabActive: { backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  tabText: { color: colors.faint, fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: colors.text },
  refreshError: { marginHorizontal: 16, marginBottom: 12, borderRadius: 10, backgroundColor: "#2b1110", padding: 10 },
  refreshErrorText: { color: "#ff9584", fontSize: 11 },
  noticeLink: { color: colors.accent, fontSize: 12, fontWeight: "800", marginTop: 8 },
  schedule: { padding: 18, gap: 10 },
  sectionKicker: { color: colors.accent, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5 },
  scheduleRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: 1, borderColor: colors.border },
  scheduleNumber: { color: colors.faint, fontSize: 12, fontWeight: "900" },
  scheduleTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  scheduleMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  details: { padding: 20, paddingBottom: 150, gap: 11 },
  detailsTitle: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  bodyCopy: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  metrics: { flexDirection: "row", gap: 9, marginVertical: 12 },
  metric: { flex: 1, minHeight: 85, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  metricLabel: { color: colors.faint, fontSize: 10, fontWeight: "700", marginTop: 3 },
  infoCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 14 },
  infoRow: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12 },
  infoValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700", textAlign: "right" },
  reportButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginTop: 7 },
  reportButtonText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
});
