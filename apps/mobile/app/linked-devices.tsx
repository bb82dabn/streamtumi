import { Ionicons } from "@expo/vector-icons";
import {
  deviceRevocationResponseSchema,
  linkedDevicesResponseSchema,
  type LinkedDevice,
} from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function LinkedDevicesScreen() {
  const { session } = useAuth();
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) return () => { active = false; };
    setError("");
    void requestJson("/api/mobile/v1/account/devices", linkedDevicesResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) setDevices(result.devices); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Linked devices could not be loaded."); });
    return () => { active = false; };
  }, [session]));

  function unlink(device: LinkedDevice) {
    Alert.alert(
      `Unlink ${device.displayName}?`,
      "The device will continue anonymous playback but will lose account rooms, personalization, and tune history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: () => {
            setBusyId(device.id);
            setError("");
            void requestJson(
              `/api/mobile/v1/account/devices/${encodeURIComponent(device.id)}`,
              deviceRevocationResponseSchema,
              { method: "DELETE" },
            )
              .then(() => setDevices((current) => current?.filter((item) => item.id !== device.id) ?? []))
              .catch((caught) => setError(caught instanceof Error ? caught.message : "The device could not be unlinked."))
              .finally(() => setBusyId(""));
          },
        },
      ],
    );
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in to manage linked devices." /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>
        <View><Text style={styles.eyebrow}>TV access</Text><Text style={styles.title}>Linked devices</Text></View>
      </View>
      {devices == null ? (
        <ScreenState loading={!error} title={error ? "Devices unavailable" : "Loading devices"} message={error || "Checking TV access for your account."} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.copy}>Roku and TV clients use limited catalog, private-room, and tune-history access. Revocation does not affect anonymous playback.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => router.push("/activate-device")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Link another device</Text></Pressable>
          {!devices.length ? (
            <View style={styles.empty}>
              <Ionicons name="tv-outline" size={35} color={colors.faint} />
              <Text style={styles.emptyTitle}>No linked devices</Text>
              <Text style={styles.emptyCopy}>Open StreamTumi on a TV to get an activation code.</Text>
            </View>
          ) : devices.map((device) => (
            <View key={device.id} style={styles.row}>
              <View style={styles.icon}><Ionicons name={device.deviceType === "ROKU" ? "logo-buffer" : "tv-outline"} size={23} color={colors.accent} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{device.displayName}</Text>
                <Text style={styles.rowDetail}>{device.deviceType === "ROKU" ? "Roku" : "TV"} / Last used {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleDateString() : "not yet"}</Text>
              </View>
              <Pressable disabled={busyId === device.id} onPress={() => unlink(device)} style={styles.unlink}>
                <Text style={styles.unlinkText}>{busyId === device.id ? "Working..." : "Unlink"}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: colors.border },
  back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  content: { padding: 18, paddingBottom: 100, gap: 12 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 3 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  emptyCopy: { color: colors.muted, fontSize: 12, textAlign: "center" },
  row: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 13 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelRaised },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 3 },
  unlink: { minHeight: 38, justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: "#703a3a", paddingHorizontal: 11 },
  unlinkText: { color: "#ff9584", fontSize: 11, fontWeight: "800" },
});
