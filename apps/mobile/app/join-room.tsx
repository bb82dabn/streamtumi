import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { roomPlaybackResponseSchema } from "@streamtumi/contracts";
import { jsonRequest, requestJson } from "@/lib/api";
import { setRoomSession, setStationGrant } from "@/lib/storage";
import { colors } from "@/lib/theme";

function stationAccess(stationUrl: string) {
  const url = new URL(stationUrl);
  const match = /^\/api\/public\/stations\/([^/]+)$/.exec(url.pathname);
  const grant = url.searchParams.get("grant");
  const encodedToken = match?.[1];
  if (!encodedToken || !grant) throw new Error("The room returned an invalid playback link.");
  return { token: decodeURIComponent(encodedToken), grant };
}

export default function JoinRoomScreen() {
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (!/^\d{6}$/.test(accessKey)) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(
        "/api/mobile/v1/rooms/access",
        roomPlaybackResponseSchema,
        jsonRequest({ accessKey }, { method: "POST" }),
      );
      const access = stationAccess(result.station.stationUrl);
      const open = async () => {
        await setStationGrant(access.token, { grant: access.grant, expiresAt: result.station.grantExpiresAt });
        if (result.roomSessionToken) await setRoomSession(access.token, result.roomSessionToken);
        router.replace({ pathname: "/station/[token]", params: { token: access.token, source: "room-key" } });
      };
      if (result.station.explicit) {
        Alert.alert(
          "Explicit room",
          "This room contains explicit content. Confirm that you are 18 or older to continue.",
          [{ text: "Cancel", style: "cancel" }, { text: "I am 18 or older", onPress: () => void open() }],
        );
      } else {
        await open();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close room entry" onPress={() => router.back()} style={styles.iconButton}><Ionicons name="close" size={23} color={colors.text} /></Pressable>
        <Text style={styles.headerTitle}>Join a room</Text>
        <View style={styles.iconSpacer} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.content}>
        <View style={styles.badge}><Ionicons name="keypad" size={28} color={colors.accent} /></View>
        <Text style={styles.eyebrow}>Private broadcast</Text>
        <Text style={styles.title}>Enter your room key</Text>
        <Text style={styles.copy}>Use the six-digit key shared by the room owner. You do not need a station link.</Text>
        <TextInput
          accessibilityLabel="Six-digit room key"
          autoFocus
          editable={!busy}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(value) => setAccessKey(value.replace(/\D/g, ""))}
          onSubmitEditing={() => void join()}
          placeholder="000000"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={accessKey}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable disabled={busy || accessKey.length !== 6} onPress={() => void join()} style={({ pressed }) => [styles.button, (pressed || busy || accessKey.length !== 6) && styles.buttonMuted]}>
          <Text style={styles.buttonText}>{busy ? "Opening room..." : "Join room"}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  iconSpacer: { width: 42 },
  content: { flex: 1, paddingHorizontal: 26, justifyContent: "center", alignItems: "center", paddingBottom: 80 },
  badge: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 31, fontWeight: "900", letterSpacing: -1, marginTop: 8, textAlign: "center" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330, marginTop: 10 },
  input: { width: "100%", maxWidth: 330, height: 76, marginTop: 30, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, textAlign: "center", fontSize: 34, fontWeight: "900", letterSpacing: 12, paddingLeft: 20 },
  error: { color: "#ff9584", fontSize: 13, textAlign: "center", marginTop: 14 },
  button: { width: "100%", maxWidth: 330, minHeight: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, marginTop: 18 },
  buttonMuted: { opacity: 0.45 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "900" },
});
