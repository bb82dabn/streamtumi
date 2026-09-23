import { Ionicons } from "@expo/vector-icons";
import type { StationKind } from "@streamtumi/contracts";
import { useDeferredValue, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { StationCard } from "@/components/StationCard";
import { colors } from "@/lib/theme";
import { useCatalog } from "@/providers/CatalogProvider";

type KindFilter = "ALL" | StationKind;

export default function GuideScreen() {
  const { catalog, loading, refreshing, error, refresh } = useCatalog();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [liveOnly, setLiveOnly] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  if (loading && !catalog) return <SafeAreaView style={styles.safe}><ScreenState loading title="Loading Stream Guide" message="Finding TV and Radio stations." /></SafeAreaView>;
  if (!catalog) return <SafeAreaView style={styles.safe}><ScreenState title="Guide unavailable" message={error || "The guide could not be loaded."} actionLabel="Try again" onAction={() => void refresh()} /></SafeAreaView>;

  const filtered = catalog.stations.filter((station) => {
    if (kind !== "ALL" && station.stationKind !== kind) return false;
    if (genreId && station.genreId !== genreId) return false;
    if (liveOnly && !station.online) return false;
    return !deferredQuery || [station.name, station.ownerName, station.genreName, station.description].some((value) => value.toLocaleLowerCase().includes(deferredQuery));
  });

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <FlatList
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Every channel, one dial</Text>
            <Text style={styles.title}>Stream Guide</Text>
            <View style={styles.search}>
              <Ionicons name="search" size={19} color={colors.faint} />
              <TextInput autoCapitalize="none" onChangeText={setQuery} placeholder="Stations, shows, genres" placeholderTextColor={colors.faint} style={styles.searchInput} value={query} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {(["ALL", "TV", "RADIO"] as const).map((value) => <FilterChip key={value} active={kind === value} label={value === "ALL" ? "All" : value === "RADIO" ? "Radio" : "TV"} onPress={() => setKind(value)} />)}
              <FilterChip active={liveOnly} label="On air" onPress={() => setLiveOnly((value) => !value)} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genres}>
              <FilterChip active={!genreId} label="Every genre" onPress={() => setGenreId(null)} />
              {catalog.genres.map((genre) => <FilterChip key={genre.id} active={genreId === genre.id} label={genre.name} onPress={() => setGenreId(genre.id)} />)}
            </ScrollView>
            <View style={styles.resultLine}>
              <Text style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? "station" : "stations"}</Text>
              {error ? <Text style={styles.error}>Last refresh failed</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<ScreenState title="No matching stations" message="Try a broader search or clear a filter." />}
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={(station) => station.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
        renderItem={({ item }) => <View style={styles.card}><StationCard station={item} wide /></View>}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: 150 },
  header: { paddingTop: 16, paddingBottom: 15, gap: 12 },
  eyebrow: { paddingHorizontal: 18, color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  title: { paddingHorizontal: 18, color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1.2 },
  search: { marginHorizontal: 18, height: 52, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  filters: { gap: 8, paddingHorizontal: 18 },
  genres: { gap: 8, paddingHorizontal: 18 },
  chip: { minHeight: 37, justifyContent: "center", borderRadius: 19, paddingHorizontal: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: colors.background },
  resultLine: { paddingHorizontal: 18, flexDirection: "row", justifyContent: "space-between" },
  resultCount: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  error: { color: "#ff9584", fontSize: 11 },
  card: { paddingHorizontal: 18, paddingBottom: 12 },
});
