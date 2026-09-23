import { Ionicons } from "@expo/vector-icons";
import {
  deviceActivationRequestSchema,
  deviceActivationResponseSchema,
} from "@streamtumi/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { jsonRequest, requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

function formatCode(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export default function ActivateDeviceScreen() {
  const params = useLocalSearchParams<{ user_code?: string }>();
  const { session } = useAuth();
  const [userCode, setUserCode] = useState(formatCode(params.user_code ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function activate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = deviceActivationRequestSchema.parse({ userCode });
      const result = await requestJson(
        "/api/mobile/v1/account/devices/activate",
        deviceActivationResponseSchema,
        jsonRequest(body, { method: "POST" }),
      );
      setNotice(`${result.device.displayName} is approved. Return to the TV to finish linking.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The device could not be linked.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in to link a TV device." /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>
          <View><Text style={styles.eyebrow}>TV activation</Text><Text style={styles.title}>Link a screen</Text></View>
        </View>
        <View style={styles.heroIcon}><Ionicons name="tv-outline" size={36} color={colors.accent} /></View>
        <Text style={styles.copy}>Enter the code shown by StreamTumi on your Roku or TV. The code expires after 10 minutes.</Text>
        <TextInput
          accessibilityLabel="Activation code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          onChangeText={(value) => setUserCode(formatCode(value))}
          placeholder="ABCD-EFGH"
          placeholderTextColor={colors.faint}
          style={styles.codeInput}
          value={userCode}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable disabled={busy || userCode.length !== 9} onPress={() => void activate()} style={[commonStyles.button, (busy || userCode.length !== 9) && styles.disabled]}>
          <Text style={commonStyles.buttonText}>{busy ? "Approving..." : "Link device"}</Text>
        </Pressable>
        <View style={styles.scopeNote}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.success} />
          <Text style={styles.scopeText}>Linked TVs can read the catalog, save private-room memberships, and add tune history. They cannot change account settings or post to community APIs.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 18, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 20 },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  heroIcon: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5b2c24" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  codeInput: { minHeight: 68, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, paddingHorizontal: 16, fontSize: 27, fontWeight: "900", letterSpacing: 4, textAlign: "center" },
  scopeNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, backgroundColor: "#102019", padding: 14 },
  scopeText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#12251c", padding: 12 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 12 },
  disabled: { opacity: 0.5 },
});
