import { Ionicons } from "@expo/vector-icons";
import { mobileAccountSettingsResponseSchema, type MobileAccountSettings } from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { requestJson } from "@/lib/api";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useHistory } from "@/providers/HistoryProvider";
import { useRadio } from "@/providers/RadioProvider";

export default function DeleteAccountScreen() {
  const { session, deleteAccount } = useAuth();
  const history = useHistory();
  const radio = useRadio();
  const [account, setAccount] = useState<MobileAccountSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void requestJson("/api/mobile/v1/account/settings", mobileAccountSettingsResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) setAccount(result.account); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Deletion details could not be loaded."); });
    return () => { active = false; };
  }, [session]));

  function confirmDeletion() {
    Alert.alert(
      "Permanently close this account?",
      "Access stops immediately. This request cannot be reversed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void submit() },
      ],
    );
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await deleteAccount({
        confirmationEmail: email,
        currentPassword: password,
      });
      radio.stop();
      history.clearHistory();
      Alert.alert(
        "Deletion requested",
        "StreamTumi access is closed and deletion has been scheduled.",
        [{ text: "Continue", onPress: () => router.replace("/(tabs)/account") }],
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account deletion could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Account signed out" message="There is no signed-in account to delete." actionLabel="Return to account" onAction={() => router.replace("/(tabs)/account")} /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable><Text style={styles.headerTitle}>Delete account</Text></View>
          {!account ? <ScreenState loading={!error} title={error ? "Deletion unavailable" : "Loading account"} message={error || "Checking the required confirmation."} /> : (
            <View style={styles.dangerCard}>
              <View style={styles.warningIcon}><Ionicons name="warning" size={30} color="#ff9584" /></View>
              <Text style={styles.eyebrow}>Permanent action</Text>
              <Text style={styles.title}>Close your StreamTumi account</Text>
              <Text style={styles.copy}>Your account and every owned station are locked immediately. Stations stop broadcasting and enter deferred purge. Evidence under legal hold remains preserved, and account anonymization waits for held stations to be released and purged.</Text>
              <View style={styles.rule} />
              <Text style={styles.requirement}>Type this normalized email exactly:</Text>
              <Text selectable style={styles.accountEmail}>{account.email.trim().toLowerCase()}</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                onChangeText={setEmail}
                placeholder="Account email"
                placeholderTextColor={colors.faint}
                style={styles.field}
                value={email}
              />
              <Text style={styles.requirement}>Confirm your current password:</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                maxLength={128}
                onChangeText={setPassword}
                placeholder="Current password"
                placeholderTextColor={colors.faint}
                secureTextEntry
                style={styles.field}
                value={password}
              />
              {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
              <Pressable
                disabled={busy || email.trim().toLowerCase() !== account.email.trim().toLowerCase() || !password}
                onPress={confirmDeletion}
                style={[styles.deleteButton, (busy || email.trim().toLowerCase() !== account.email.trim().toLowerCase() || !password) && styles.disabled]}
              >
                <Text style={styles.deleteButtonText}>{busy ? "Closing account..." : "Permanently delete account"}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => router.back()} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Keep my account</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 18, paddingBottom: 70, gap: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  dangerCard: { gap: 15, borderRadius: 24, borderWidth: 1, borderColor: "#703a3a", backgroundColor: "#1c1011", padding: 21 },
  warningIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#35191b", borderWidth: 1, borderColor: "#703a3a" },
  eyebrow: { color: "#ff9584", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 27, fontWeight: "900", letterSpacing: -0.8 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: "#703a3a", marginVertical: 2 },
  requirement: { color: colors.text, fontSize: 12, fontWeight: "800" },
  accountEmail: { color: "#ffb1a7", fontSize: 13, fontWeight: "800" },
  field: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: "#703a3a", backgroundColor: "#120a0b", color: colors.text, paddingHorizontal: 15, fontSize: 16 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  deleteButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#b93636", marginTop: 3 },
  deleteButtonText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  cancelButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  cancelButtonText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.42 },
});
