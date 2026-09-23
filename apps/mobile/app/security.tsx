import { Ionicons } from "@expo/vector-icons";
import { mobileAccountSettingsResponseSchema, type MobileAccountSettings } from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function SecurityScreen() {
  const { session, changePassword } = useAuth();
  const [account, setAccount] = useState<MobileAccountSettings | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void requestJson("/api/mobile/v1/account/settings", mobileAccountSettingsResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) setAccount(result.account); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Account security could not be loaded."); });
    return () => { active = false; };
  }, [session]));

  async function submit() {
    if (newPassword !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setMessage("Password changed. Other devices and credentials were signed out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in to manage account security." /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Header title="Password & security" />
          {!account ? <ScreenState loading={!error} title={error ? "Security unavailable" : "Loading security"} message={error || "Checking your password settings."} /> : (
            <View style={styles.card}>
              <View style={styles.icon}><Ionicons name="lock-closed-outline" size={25} color={colors.accent} /></View>
              <Text style={styles.title}>Change password</Text>
              <Text style={styles.copy}>Confirm your current password. A fresh mobile session will replace all existing sessions and refresh credentials.</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {message ? <Text style={styles.notice}>{message}</Text> : null}
              <PasswordField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} autoComplete="current-password" />
              <PasswordField label="New password" value={newPassword} onChangeText={setNewPassword} autoComplete="new-password" />
              <PasswordField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} autoComplete="new-password" />
              <Pressable disabled={busy} onPress={() => void submit()} style={[commonStyles.button, busy && styles.disabled]}><Text style={commonStyles.buttonText}>{busy ? "Changing..." : "Change password"}</Text></Pressable>
              <Pressable onPress={() => router.push("/forgot-password")} style={commonStyles.quietButton}><Text style={commonStyles.quietButtonText}>Use password reset instead</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable><Text style={styles.headerTitle}>{title}</Text></View>;
}

function PasswordField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}</Text><TextInput autoCapitalize="none" maxLength={128} placeholderTextColor={colors.faint} secureTextEntry style={commonStyles.field} {...props} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 18, paddingBottom: 80, gap: 22 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  headerTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  card: { gap: 16, borderRadius: 23, padding: 21, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  icon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  fieldGroup: { gap: 8 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800" },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#12251c", padding: 11 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  disabled: { opacity: 0.48 },
});
