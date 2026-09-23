import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { StationCard } from "@/components/StationCard";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";

export default function FansScreen() {
  const { session, ready, registrationEnabled } = useAuth();
  const { catalog, loading, error, refresh } = useCatalog();
  if (!ready || (loading && !catalog)) return <SafeAreaView style={styles.safe}><ScreenState loading title="Loading your stations" message="Syncing your StreamTumi audience profile." /></SafeAreaView>;
  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.guest}>
          <View style={styles.heart}><Ionicons name="heart" size={32} color={colors.accent} /></View>
          <Text style={styles.title}>Your front row</Text>
          <Text style={styles.copy}>Sign in to collect stations, keep up with broadcasts, and find your communities again.</Text>
          <Pressable onPress={() => router.push("/login")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Sign in</Text></Pressable>
          {registrationEnabled ? <Pressable onPress={() => router.push("/register")} style={commonStyles.quietButton}><Text style={commonStyles.quietButtonText}>Create account</Text></Pressable> : null}
        </View>
      </SafeAreaView>
    );
  }
  if (!catalog) return <SafeAreaView style={styles.safe}><ScreenState title="Fans unavailable" message={error || "Your fan stations could not be loaded."} actionLabel="Try again" onAction={() => void refresh()} /></SafeAreaView>;
  const stations = catalog.stations.filter((station) => station.isFan);
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Your communities</Text>
        <Text style={styles.title}>Fan stations</Text>
        <Text style={styles.copy}>{stations.length ? `${stations.length} ${stations.length === 1 ? "station" : "stations"} in your personal lineup.` : "Build a lineup that feels like yours."}</Text>
        {stations.length ? stations.map((station) => <StationCard key={station.id} station={station} wide />) : (
          <View style={styles.emptyCard}>
            <Ionicons name="heart-outline" size={32} color={colors.faint} />
            <Text style={styles.emptyTitle}>No fan stations yet</Text>
            <Text style={styles.emptyCopy}>Open a station from the guide and become a fan to keep it here.</Text>
            <Pressable onPress={() => router.push("/(tabs)/guide")} style={commonStyles.quietButton}><Text style={commonStyles.quietButtonText}>Explore the guide</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  guest: { flex: 1, justifyContent: "center", padding: 26, gap: 14 },
  content: { padding: 18, paddingTop: 24, paddingBottom: 150, gap: 14 },
  heart: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5c2c23", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.7, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1.2 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  emptyCard: { minHeight: 310, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: "800" },
  emptyCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 8 },
});
