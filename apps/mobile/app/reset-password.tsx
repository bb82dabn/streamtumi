import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand } from "@/components/Brand";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const linkedToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const { resetPassword } = useAuth();
  const [token, setToken] = useState(linkedToken ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword({ token: token.trim(), newPassword: password });
      router.replace("/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Brand />
          <View style={styles.card}>
            <View style={styles.icon}><Ionicons name="key-outline" size={28} color={colors.accent} /></View>
            <Text style={styles.eyebrow}>Single-use reset</Text>
            <Text style={styles.title}>Choose a new password</Text>
            <Text style={styles.copy}>Reset links expire after 30 minutes. Completing this reset signs out every device.</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <Field label="Reset token" value={token} onChangeText={setToken} placeholder="Token from your email" maxLength={43} />
            <Field label="New password" value={password} onChangeText={setPassword} placeholder="At least 10 characters" secureTextEntry maxLength={128} />
            <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} placeholder="Enter it again" secureTextEntry maxLength={128} />
            <Pressable disabled={busy} onPress={() => void submit()} style={[commonStyles.button, busy && styles.disabled]}>
              <Text style={commonStyles.buttonText}>{busy ? "Resetting..." : "Reset password"}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/login")} style={commonStyles.quietButton}>
              <Text style={commonStyles.quietButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}</Text><TextInput autoCapitalize="none" placeholderTextColor={colors.faint} style={commonStyles.field} {...props} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 44, gap: 30 },
  card: { marginTop: "auto", marginBottom: "auto", gap: 16, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 24 },
  icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5c2c23" },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  fieldGroup: { gap: 8 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800" },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  disabled: { opacity: 0.48 },
});
