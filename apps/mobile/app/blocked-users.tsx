import { Ionicons } from "@expo/vector-icons";
import {
  communityBlocksResponseSchema,
  communityUnblockResponseSchema,
  type CommunityBlock,
} from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "@/components/ScreenState";
import { requestJson } from "@/lib/api";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function BlockedUsersScreen() {
  const { session } = useAuth();
  const [blocks, setBlocks] = useState<CommunityBlock[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) return () => { active = false; };
    setError("");
    void requestJson("/api/mobile/v1/account/blocks", communityBlocksResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) setBlocks(result.blocks); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Blocked users could not be loaded."); });
    return () => { active = false; };
  }, [session]));

  function unblock(block: CommunityBlock) {
    Alert.alert(
      `Unblock ${block.snapshotDisplayName}?`,
      "Their messages can appear in chat history again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => {
            setBusyId(block.id);
            setError("");
            void requestJson(
              `/api/mobile/v1/account/blocks/${encodeURIComponent(block.id)}`,
              communityUnblockResponseSchema,
              { method: "DELETE" },
            )
              .then(() => setBlocks((current) => current?.filter((item) => item.id !== block.id) ?? []))
              .catch((caught) => setError(caught instanceof Error ? caught.message : "This user could not be unblocked."))
              .finally(() => setBusyId(""));
          },
        },
      ],
    );
  }

  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in to manage blocked users." /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>
        <View><Text style={styles.eyebrow}>Community safety</Text><Text style={styles.title}>Blocked users</Text></View>
      </View>
      {blocks == null ? (
        <ScreenState loading={!error} title={error ? "Blocks unavailable" : "Loading blocked users"} message={error || "Opening your community controls."} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.copy}>Blocked senders are hidden from your signed-in chat history and pinned messages.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!blocks.length ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={31} color={colors.faint} />
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptyCopy}>Use Block on a chat message to add someone here.</Text>
            </View>
          ) : blocks.map((block) => (
            <View key={block.id} style={styles.row}>
              <View style={styles.icon}><Ionicons name={block.kind === "GUEST" ? "person-outline" : "person-circle-outline"} size={21} color={colors.muted} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{block.snapshotDisplayName}</Text>
                <Text style={styles.rowDetail}>{block.kind === "GUEST" ? "Historical guest" : "Registered user"} / Blocked {new Date(block.blockedAt).toLocaleDateString()}</Text>
              </View>
              <Pressable disabled={busyId === block.id} onPress={() => unblock(block)} style={styles.unblock}>
                <Text style={styles.unblockText}>{busyId === block.id ? "Working..." : "Unblock"}</Text>
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
  content: { padding: 18, paddingBottom: 100, gap: 11 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  empty: { minHeight: 280, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  emptyCopy: { color: colors.muted, fontSize: 12 },
  row: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 13 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelRaised },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 3 },
  unblock: { minHeight: 38, justifyContent: "center", borderRadius: 11, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11 },
  unblockText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
});
