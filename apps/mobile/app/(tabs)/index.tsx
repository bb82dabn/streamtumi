import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { CatalogStation } from "@streamtumi/contracts";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand } from "@/components/Brand";
import { ScreenState } from "@/components/ScreenState";
import { StationRail } from "@/components/StationCard";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useHistory } from "@/providers/HistoryProvider";

export default function HomeScreen() {
  const { catalog, loading, error, refresh } = useCatalog();
  const { session } = useAuth();
  const { recentTokens } = useHistory();
  if (loading && !catalog) return <SafeAreaView style={styles.safe}><ScreenState loading title="Tuning the dial" message="Building your live StreamTumi lineup." /></SafeAreaView>;
  if (!catalog && error) return <SafeAreaView style={styles.safe}><ScreenState title="Guide unavailable" message={error} actionLabel="Try again" onAction={() => void refresh()} /></SafeAreaView>;
  if (!catalog?.stations.length) return <SafeAreaView style={styles.safe}><ScreenState title="The guide is quiet" message="No public stations are broadcasting yet. You can still join a private room with its six-digit key." actionLabel="Join private room" onAction={() => router.push("/join-room")} /></SafeAreaView>;

  const stations = catalog.stations;
  const byId = new Map(stations.map((station) => [station.id, station]));
  const sectionStations = (kind: "FEATURED" | "FANS" | "RECENT" | "POPULAR" | "TV" | "RADIO") =>
    (catalog.homeSections.find((section) => section.kind === kind)?.stationIds ?? []).map((id) => byId.get(id)).filter(isStation);
  const featuredStations = sectionStations("FEATURED");
  const popular = sectionStations("POPULAR");
  const featured = featuredStations[0] ?? popular[0];
  const fanStations = sectionStations("FANS");
  const recent = session
    ? sectionStations("RECENT")
    : recentTokens.map((token) => stations.find((station) => station.token === token)).filter(isStation);
  const tv = sectionStations("TV");
  const radio = sectionStations("RADIO");

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Brand />
          <View style={styles.headerActions}>
            <Pressable accessibilityLabel="Join a private room" onPress={() => router.push("/join-room")} style={styles.headerButton}>
              <Ionicons name="keypad" size={20} color={colors.text} />
            </Pressable>
            <Pressable accessibilityLabel="Open Stream Guide" onPress={() => router.push("/(tabs)/guide")} style={styles.headerButton}>
              <Ionicons name="search" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>
        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>{session ? "Your live lineup" : "Broadcasting now"}</Text>
          <Text style={styles.heading}>{session?.displayName ? `For you, ${session.displayName}` : "Watch. Listen. Belong."}</Text>
        </View>
        {featured ? <FeaturedHero featured={featured.isFeatured} station={featured} /> : null}
        {error ? <Text style={styles.syncError}>{error}</Text> : null}
        <StationRail title="Your fan stations" kicker="Personalized" stations={fanStations} emptyMessage="Become a fan from a station page and it will appear here." />
        <StationRail title="Recently tuned" stations={recent} emptyMessage="Stations you open will be kept here for a quick return." />
        <StationRail title="Popular now" kicker="Live pulse" stations={popular} />
        <StationRail title="Television" kicker="Watch" stations={tv} />
        <StationRail title="Radio" kicker="Listen" stations={radio} />
        {catalog.genres.map((genre) => {
          const genreStations = stations.filter((station) => station.genreId === genre.id);
          return genreStations.length ? <StationRail key={genre.id} title={genre.name} stations={genreStations} /> : null;
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedHero({ featured, station }: { featured: boolean; station: CatalogStation }) {
  const content = (
    <>
      <View style={styles.heroShade} />
      <View style={styles.heroTop}>
        <View style={styles.featuredBadge}><Text style={styles.featuredText}>{featured ? "FEATURED" : "POPULAR LIVE"}</Text></View>
        <View style={styles.kindBadge}><Text style={styles.kindText}>{station.stationKind}</Text></View>
      </View>
      <View style={styles.heroCopy}>
        <Text numberOfLines={1} style={styles.heroGenre}>{station.genreName} / {station.online ? "On air" : "Station"}</Text>
        <Text numberOfLines={2} style={styles.heroTitle}>{station.name}</Text>
        <Text numberOfLines={2} style={styles.heroDescription}>{station.nowPlaying ? `${station.nowPlaying.artist} / ${station.nowPlaying.title}` : station.description}</Text>
        <View style={styles.heroAction}>
          <Ionicons name={station.stationKind === "TV" ? "play" : "headset"} size={17} color={colors.white} />
          <Text style={styles.heroActionText}>{station.stationKind === "TV" ? "Watch live" : "Listen live"}</Text>
        </View>
      </View>
    </>
  );
  return (
    <Pressable onPress={() => router.push({ pathname: "/station/[token]", params: { token: station.token } })} style={styles.hero}>
      {station.artworkUrl ? <ImageBackground source={{ uri: station.artworkUrl }} style={styles.heroImage} imageStyle={styles.heroImageRadius}>{content}</ImageBackground> : <View style={[styles.heroImage, styles.heroFallback]}>{content}</View>}
    </Pressable>
  );
}

function isStation(station: CatalogStation | undefined): station is CatalogStation {
  return Boolean(station);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 150, gap: 28 },
  header: { paddingHorizontal: 18, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  welcome: { paddingHorizontal: 18, gap: 3 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.7, textTransform: "uppercase" },
  heading: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  hero: { marginHorizontal: 18, height: 390, borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
  heroImage: { flex: 1 },
  heroImageRadius: { borderRadius: 25 },
  heroFallback: { backgroundColor: "#5d1e16" },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(2,4,5,0.46)" },
  heroTop: { flexDirection: "row", gap: 7, padding: 18 },
  featuredBadge: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  featuredText: { color: colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  kindBadge: { backgroundColor: "rgba(5,7,8,0.8)", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  kindText: { color: colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroCopy: { marginTop: "auto", padding: 20, paddingTop: 80 },
  heroGenre: { color: "#d7dde0", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2 },
  heroTitle: { color: colors.white, fontSize: 35, fontWeight: "900", letterSpacing: -1.2, marginTop: 7 },
  heroDescription: { color: "#d2d8dc", fontSize: 14, lineHeight: 20, marginTop: 7 },
  heroAction: { marginTop: 17, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 13, paddingHorizontal: 16, minHeight: 46, backgroundColor: colors.accent },
  heroActionText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  syncError: { marginHorizontal: 18, color: "#ff9584", fontSize: 12 },
});
