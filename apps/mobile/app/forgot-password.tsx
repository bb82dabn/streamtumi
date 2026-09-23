import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand } from "@/components/Brand";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await requestPasswordReset({ email }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset instructions could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Brand />
          <View style={styles.card}>
            <View style={styles.icon}><Ionicons name="mail-outline" size={28} color={colors.accent} /></View>
            <Text style={styles.eyebrow}>Account recovery</Text>
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.copy}>Enter your email. For privacy, the response is the same whether or not a password account exists.</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.faint}
                style={commonStyles.field}
                value={email}
              />
            </View>
            <Pressable disabled={busy} onPress={() => void submit()} style={[commonStyles.button, busy && styles.disabled]}>
              <Text style={commonStyles.buttonText}>{busy ? "Requesting..." : "Send reset instructions"}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/login")} style={commonStyles.quietButton}>
              <Text style={commonStyles.quietButtonText}>Return to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  close: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", marginLeft: 18, marginTop: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  content: { flexGrow: 1, padding: 20, paddingBottom: 44, gap: 30 },
  card: { marginTop: "auto", marginBottom: "auto", gap: 16, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 24 },
  icon: { width: 58, height: 58, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5c2c23" },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -1 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  fieldGroup: { gap: 8 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800" },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#12251c", padding: 11 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  disabled: { opacity: 0.48 },
});
