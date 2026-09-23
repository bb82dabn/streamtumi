import { Ionicons } from "@expo/vector-icons";
import {
  adultContentPreferenceRequestSchema,
  adultContentPreferenceResponseSchema,
  mobileAccountSettingsResponseSchema,
  tuneHistoryClearResponseSchema,
  weatherLocationResponseSchema,
  weatherLocationUpdateRequestSchema,
  type MobileAccountSettings,
} from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { jsonRequest, requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useHistory } from "@/providers/HistoryProvider";

export default function SettingsScreen() {
  const { session } = useAuth();
  const catalog = useCatalog();
  const history = useHistory();
  const [account, setAccount] = useState<MobileAccountSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [weatherZipCode, setWeatherZipCode] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) return () => { active = false; };
    setError("");
    void requestJson("/api/mobile/v1/account/settings", mobileAccountSettingsResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) { setAccount(result.account); setWeatherZipCode(result.account.weatherZipCode ?? ""); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Account settings could not be loaded."); });
    return () => { active = false; };
  }, [session]));

  async function saveExplicit(showExplicitContent: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = adultContentPreferenceRequestSchema.parse({ showExplicitContent, confirmAdult: showExplicitContent || undefined });
      const result = await requestJson(
        "/api/mobile/v1/account/content-preferences",
        adultContentPreferenceResponseSchema,
        jsonRequest(body, { method: "PATCH" }),
      );
      setAccount((current) => current ? { ...current, ...result } : current);
      setNotice(showExplicitContent ? "Adult content is now included in your guide." : "Adult content is hidden. Your prior age confirmation remains recorded.");
      await catalog.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The content preference could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  function changeExplicit(next: boolean) {
    if (!next) {
      void saveExplicit(false);
      return;
    }
    Alert.alert(
      "Confirm you are 18 or older",
      "Enabling this setting may show stations marked as explicit. Your confirmation time will be recorded.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "I am 18 or older", onPress: () => void saveExplicit(true) },
      ],
    );
  }

  function clearHistory() {
    Alert.alert(
      "Clear tune history?",
      "This permanently removes your retained 90-day tune history and recent stations from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear history",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            setError("");
            void requestJson("/api/mobile/v1/account/tune-history", tuneHistoryClearResponseSchema, { method: "DELETE" })
              .then((result) => {
                history.clearHistory();
                setNotice(result.deleted ? `Removed ${result.deleted} tune history records.` : "Your tune history is clear.");
              })
              .catch((caught) => setError(caught instanceof Error ? caught.message : "Tune history could not be cleared."))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  async function saveWeatherLocation() {
    const parsed = weatherLocationUpdateRequestSchema.safeParse({ weatherZipCode: weatherZipCode || null });
    if (!parsed.success) {
      setError("Enter exactly five digits, or leave the ZIP code blank to clear it.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson(
        "/api/mobile/v1/account/weather-location",
        weatherLocationResponseSchema,
        jsonRequest(parsed.data, { method: "PATCH" }),
      );
      setWeatherZipCode(result.weatherZipCode ?? "");
      setAccount((current) => current ? { ...current, weatherZipCode: result.weatherZipCode } : current);
      setNotice(result.weatherZipCode ? "Weather location saved." : "Weather location cleared.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Weather location could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in to manage account settings." /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>
          <View><Text style={styles.eyebrow}>Your controls</Text><Text style={styles.headerTitle}>Account settings</Text></View>
        </View>
        {!account ? <ScreenState loading={!error} title={error ? "Settings unavailable" : "Loading settings"} message={error || "Opening your account controls."} /> : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.icon}><Ionicons name="partly-sunny-outline" size={21} color={colors.accent} /></View>
                <View style={styles.rowCopy}><Text style={styles.rowTitle}>Local weather ZIP</Text><Text style={styles.rowDetail}>Used for your private weather location. Only the ZIP code is stored.</Text></View>
              </View>
              <TextInput accessibilityLabel="Weather ZIP code" autoComplete="postal-code" inputMode="numeric" keyboardType="number-pad" maxLength={5} onChangeText={setWeatherZipCode} placeholder="12345" placeholderTextColor={colors.faint} style={commonStyles.field} value={weatherZipCode} />
              <Pressable disabled={busy} onPress={() => void saveWeatherLocation()} style={[commonStyles.button, busy && styles.disabled]}><Text style={commonStyles.buttonText}>{busy ? "Saving..." : "Save weather location"}</Text></Pressable>
            </View>
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.icon}><Ionicons name="warning-outline" size={21} color={colors.warning} /></View>
                <View style={styles.rowCopy}><Text style={styles.rowTitle}>Show adult content</Text><Text style={styles.rowDetail}>Include stations marked explicit in your guide.</Text></View>
                <Switch disabled={busy} onValueChange={changeExplicit} value={account.showExplicitContent} trackColor={{ false: colors.border, true: colors.accentDark }} thumbColor={account.showExplicitContent ? colors.accent : colors.muted} />
              </View>
              <Text style={styles.attestation}>{account.explicitAgeAttestedAt ? `Age confirmed ${new Date(account.explicitAgeAttestedAt).toLocaleDateString()}. Disabling does not erase this attestation.` : "Enabling requires an explicit 18+ confirmation."}</Text>
            </View>
            <Pressable disabled={busy} onPress={clearHistory} style={styles.actionRow}>
              <View style={styles.icon}><Ionicons name="time-outline" size={21} color={colors.muted} /></View>
              <View style={styles.rowCopy}><Text style={styles.rowTitle}>Clear tune history</Text><Text style={styles.rowDetail}>Delete retained listening activity from the last 90 days.</Text></View>
              <Ionicons name="trash-outline" size={19} color={colors.faint} />
            </Pressable>
            <Pressable onPress={() => router.push("/linked-devices")} style={styles.actionRow}>
              <View style={styles.icon}><Ionicons name="tv-outline" size={21} color={colors.muted} /></View>
              <View style={styles.rowCopy}><Text style={styles.rowTitle}>Linked devices</Text><Text style={styles.rowDetail}>Review and unlink Roku or TV clients.</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
            <Pressable onPress={() => router.push("/security")} style={styles.actionRow}>
              <View style={styles.icon}><Ionicons name="lock-closed-outline" size={21} color={colors.muted} /></View>
              <View style={styles.rowCopy}><Text style={styles.rowTitle}>Password & security</Text><Text style={styles.rowDetail}>Change or reset your password.</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
            <View style={styles.dangerZone}>
              <Text style={styles.dangerEyebrow}>Danger zone</Text>
              <Text style={styles.dangerTitle}>Delete StreamTumi account</Text>
              <Text style={styles.rowDetail}>Access closes immediately. Station and account data are purged after the configured grace period unless evidence is under legal hold.</Text>
              <Pressable onPress={() => router.push("/delete-account")} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Review account deletion</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 18, paddingBottom: 100, gap: 13 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 10 },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  card: { gap: 13, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 15 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 15 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelRaised },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  attestation: { color: colors.faint, fontSize: 11, lineHeight: 16, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dangerZone: { gap: 10, marginTop: 10, borderRadius: 19, borderWidth: 1, borderColor: "#703a3a", backgroundColor: "#211112", padding: 17 },
  dangerEyebrow: { color: "#ff9584", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
  dangerTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  dangerButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: "#9b4b4b", backgroundColor: "#35191b", marginTop: 5 },
  dangerButtonText: { color: "#ffaaa0", fontSize: 14, fontWeight: "900" },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#12251c", padding: 11 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  disabled: { opacity: 0.48 },
});
