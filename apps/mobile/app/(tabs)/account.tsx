import { Ionicons } from "@expo/vector-icons";
import { communityProfileResponseSchema, type CommunityProfile } from "@streamtumi/contracts";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AvatarImage } from "@/components/AvatarImage";
import { Brand } from "@/components/Brand";
import { ScreenState } from "@/components/ScreenState";
import { API_ORIGIN, requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useRadio } from "@/providers/RadioProvider";

export default function AccountScreen() {
  const { ready, registrationEnabled, session, logout } = useAuth();
  const radio = useRadio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<CommunityProfile | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!session) {
      setProfile(null);
      return () => { active = false; };
    }
    void requestJson("/api/mobile/v1/account/profile", communityProfileResponseSchema, { cache: "no-store" })
      .then((result) => { if (active) setProfile(result.profile); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [session]));

  if (!ready) return <SafeAreaView style={styles.safe}><ScreenState loading title="Opening account" message="Checking your secure session." /></SafeAreaView>;

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      radio.stop();
      await logout();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign out failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Brand />
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{session ? "Audience profile" : "Your StreamTumi"}</Text>
          <Text style={styles.title}>{session ? profile?.displayName || session.displayName || "You are tuned in" : "Make it personal"}</Text>
          <Text style={styles.copy}>{session?.email || "Follow stations, join live chat, and bring your lineup with you."}</Text>
        </View>
        {session ? (
          <>
            <View style={styles.profileCard}>
              <AvatarImage avatarUrl={profile?.avatarUrl} displayName={profile?.displayName || session.displayName} size={52} />
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{profile?.displayName || session.displayName || "StreamTumi listener"}</Text>
                <Text style={styles.profileMeta}>{session.email || "Secure mobile session"}</Text>
              </View>
              <View style={[styles.onlineDot, !session.emailVerified && styles.unverifiedDot]} />
            </View>
            {!session.emailVerified ? (
              <View style={styles.verificationCard}>
                <Ionicons name="mail-unread-outline" size={25} color={colors.warning} />
                <View style={styles.profileCopy}>
                  <Text style={styles.verificationTitle}>Email verification required</Text>
                  <Text style={styles.verificationCopy}>Verify before posting, becoming a fan, or changing your public profile.</Text>
                </View>
                <Pressable onPress={() => router.push("/verify-email")} style={styles.verifyButton}><Text style={styles.verifyButtonText}>Verify</Text></Pressable>
              </View>
            ) : null}
            <SettingRow icon="settings-outline" title="Account settings" detail="Adult content, tune history, and deletion" onPress={() => router.push("/settings")} />
            <SettingRow icon="tv-outline" title="Link a TV device" detail="Enter a Roku or TV activation code" onPress={() => router.push("/activate-device")} />
            <SettingRow icon="lock-closed-outline" title="Password & security" detail="Password change and sign-in method" onPress={() => router.push("/security")} />
            <SettingRow disabled={!session.emailVerified} icon="person-circle-outline" title="Edit community profile" detail="Display name and avatar" onPress={() => router.push("/profile")} />
            <SettingRow disabled={!session.emailVerified} icon="heart-outline" title="Fan stations" detail="Your personal live lineup" onPress={() => router.push("/(tabs)/fans")} />
            <SettingRow icon="ban-outline" title="Blocked users" detail="Manage hidden community members" onPress={() => router.push("/blocked-users")} />
            <SettingRow icon="grid-outline" title="Stream Guide" detail="TV, Radio, and every genre" onPress={() => router.push("/(tabs)/guide")} />
            {radio.current ? <SettingRow icon="stop-circle-outline" title="Clear Radio player" detail="Remove the restored listening session" onPress={radio.stop} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable disabled={busy} onPress={() => void signOut()} style={commonStyles.quietButton}><Text style={commonStyles.quietButtonText}>{busy ? "Signing out..." : "Sign out"}</Text></Pressable>
          </>
        ) : (
          <View style={styles.authCard}>
            <View style={styles.authIcon}><Ionicons name="people-outline" size={30} color={colors.accent} /></View>
            <Text style={styles.authTitle}>Join the broadcast</Text>
            <Text style={styles.authCopy}>One account for every StreamTumi TV and Radio community.</Text>
            <Pressable onPress={() => router.push("/login")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Sign in</Text></Pressable>
            {registrationEnabled ? <Pressable onPress={() => router.push("/register")} style={commonStyles.quietButton}><Text style={commonStyles.quietButtonText}>Create account</Text></Pressable> : null}
          </View>
        )}
        <View style={styles.endpoint}>
          <Text style={styles.endpointLabel}>Connected service</Text>
          <Text numberOfLines={1} style={styles.endpointValue}>{API_ORIGIN}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ icon, title, detail, onPress, disabled = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.row, disabled && styles.disabledRow]}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={colors.muted} /></View>
      <View style={styles.profileCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingTop: 16, paddingBottom: 150, gap: 12 },
  intro: { marginTop: 22, marginBottom: 12, gap: 5 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.7, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 33, fontWeight: "900", letterSpacing: -1.2 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 20, padding: 16, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, marginBottom: 4 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  profileMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  onlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  unverifiedDot: { backgroundColor: colors.warning },
  verificationCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 15, backgroundColor: "#292313", borderWidth: 1, borderColor: "#594d24" },
  verificationTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  verificationCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  verifyButton: { minHeight: 38, justifyContent: "center", borderRadius: 11, paddingHorizontal: 13, backgroundColor: colors.accent },
  verifyButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  row: { minHeight: 69, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.panelRaised, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  rowDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  disabledRow: { opacity: 0.42 },
  authCard: { borderRadius: 23, padding: 22, gap: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  authIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: "#2c1713", alignItems: "center", justifyContent: "center" },
  authTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  authCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  endpoint: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderColor: colors.border },
  endpointLabel: { color: colors.faint, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2 },
  endpointValue: { color: colors.muted, fontSize: 12, marginTop: 5 },
  error: { color: "#ff9584", fontSize: 12 },
});
