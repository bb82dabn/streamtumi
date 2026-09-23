import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { CatalogStation } from "@streamtumi/contracts";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function StationCard({ station, wide = false }: { station: CatalogStation; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${station.name}`}
      onPress={() => router.push({ pathname: "/station/[token]", params: { token: station.token } })}
      style={({ pressed }) => [styles.card, wide && styles.cardWide, pressed && styles.pressed]}
    >
      {station.artworkUrl ? (
        <ImageBackground source={{ uri: station.artworkUrl }} resizeMode="cover" style={styles.art} imageStyle={styles.image}>
          <View style={styles.shade} />
          <CardOverlay station={station} />
        </ImageBackground>
      ) : (
        <View style={[styles.art, styles.fallback, station.stationKind === "RADIO" && styles.radioFallback]}>
          <Ionicons name={station.stationKind === "RADIO" ? "radio" : "tv"} size={34} color={colors.white} />
          <CardOverlay station={station} />
        </View>
      )}
    </Pressable>
  );
}

function CardOverlay({ station }: { station: CatalogStation }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.badges}>
        <View style={[styles.badge, station.stationKind === "RADIO" && styles.radioBadge]}>
          <Text style={styles.badgeText}>{station.stationKind}</Text>
        </View>
        {station.online ? (
          <View style={[styles.badge, styles.liveBadge]}>
            <View style={styles.liveDot} />
            <Text style={styles.badgeText}>LIVE</Text>
          </View>
        ) : null}
      </View>
      <View>
        <Text numberOfLines={1} style={styles.name}>{station.name}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {station.nowPlaying?.title || `${station.genreName} / ${station.viewerCount} watching`}
        </Text>
      </View>
    </View>
  );
}

export function StationRail({
  title,
  kicker,
  stations,
  emptyMessage,
}: {
  title: string;
  kicker?: string;
  stations: CatalogStation[];
  emptyMessage?: string;
}) {
  return (
    <View style={styles.railSection}>
      <View style={styles.railHead}>
        <View>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text style={styles.railTitle}>{title}</Text>
        </View>
        {stations.length > 0 ? <Text style={styles.count}>{stations.length}</Text> : null}
      </View>
      {stations.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {stations.map((station) => <StationCard key={station.id} station={station} />)}
        </ScrollView>
      ) : emptyMessage ? (
        <View style={styles.emptyRail}>
          <Ionicons name="heart-outline" size={20} color={colors.faint} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 232,
    height: 146,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWide: {
    width: "100%",
    height: 190,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  art: {
    flex: 1,
  },
  image: {
    borderRadius: 17,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  fallback: {
    padding: 16,
    justifyContent: "center",
    backgroundColor: colors.accentDark,
  },
  radioFallback: {
    backgroundColor: "#11665d",
  },
  overlay: {
    flex: 1,
    padding: 13,
    justifyContent: "space-between",
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(5,7,8,0.82)",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  radioBadge: {
    backgroundColor: "rgba(19,112,100,0.92)",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  name: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
    textShadowColor: colors.black,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  meta: {
    color: "#d8dfe3",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
    textShadowColor: colors.black,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  railSection: {
    gap: 12,
  },
  railHead: {
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  kicker: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  railTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  count: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "800",
  },
  rail: {
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyRail: {
    marginHorizontal: 18,
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
