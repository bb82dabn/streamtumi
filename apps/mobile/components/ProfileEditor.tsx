import { Ionicons } from "@expo/vector-icons";
import {
  communityProfileResponseSchema,
  updateCommunityProfileRequestSchema,
  type CommunityProfile,
} from "@streamtumi/contracts";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, jsonRequest, requestJson } from "@/lib/api";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { AvatarImage } from "@/components/AvatarImage";
import { ScreenState } from "@/components/ScreenState";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionContentType(uri: string): string {
  const extension = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "";
}

export function ProfileEditor() {
  const { ready, session } = useAuth();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadProfile() {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await requestJson("/api/mobile/v1/account/profile", communityProfileResponseSchema, { cache: "no-store" });
      setProfile(result.profile);
      setDisplayName(result.profile.displayName);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const loadProfileFromEffect = useEffectEvent(loadProfile);
  useEffect(() => {
    const initial = setTimeout(() => void loadProfileFromEffect(), 0);
    return () => clearTimeout(initial);
  }, [session?.id]);

  function applyProfile(next: CommunityProfile) {
    setProfile(next);
    setDisplayName(next.displayName);
  }

  function mutationError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    if (caught instanceof ApiError && caught.code === "VERSION_CONFLICT") void loadProfile();
  }

  async function saveName() {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      const input = updateCommunityProfileRequestSchema.parse({ displayName, expectedVersion: profile.version });
      const result = await requestJson(
        "/api/mobile/v1/account/profile",
        communityProfileResponseSchema,
        jsonRequest(input, { method: "PATCH" }),
      );
      applyProfile(result.profile);
    } catch (caught) {
      mutationError(caught, "Your display name could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseAvatar() {
    if (!profile) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library access is required to choose an avatar.");
      return;
    }
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    const asset = selection.canceled ? null : selection.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > maxAvatarBytes) {
      setError("Choose an image no larger than 5 MiB.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const source = await fetch(asset.uri);
      if (!source.ok) throw new Error("The selected image could not be opened.");
      const body = await source.blob();
      const contentType = asset.mimeType?.toLowerCase() || body.type.toLowerCase() || extensionContentType(asset.uri);
      if (!allowedAvatarTypes.has(contentType)) throw new Error("Choose a JPEG, PNG, or WebP image.");
      if (body.size > maxAvatarBytes) throw new Error("Choose an image no larger than 5 MiB.");
      const result = await requestJson(
        `/api/mobile/v1/account/avatar?expectedVersion=${profile.version}`,
        communityProfileResponseSchema,
        { method: "PUT", headers: { "Content-Type": contentType }, body },
      );
      applyProfile(result.profile);
    } catch (caught) {
      mutationError(caught, "Your avatar could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!profile?.avatarUrl) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(
        `/api/mobile/v1/account/avatar?expectedVersion=${profile.version}`,
        communityProfileResponseSchema,
        { method: "DELETE" },
      );
      applyProfile(result.profile);
    } catch (caught) {
      mutationError(caught, "Your avatar could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || loading) return <SafeAreaView style={styles.safe}><ScreenState loading title="Opening profile" message="Loading your community identity." /></SafeAreaView>;
  if (!session) return <SafeAreaView style={styles.safe}><ScreenState title="Sign in required" message="Sign in before editing your profile." actionLabel="Go to sign in" onAction={() => router.replace("/login")} /></SafeAreaView>;
  if (!profile) return <SafeAreaView style={styles.safe}><ScreenState title="Profile unavailable" message={error || "Your profile could not be loaded."} actionLabel="Try again" onAction={() => void loadProfile()} /></SafeAreaView>;

  const verified = session.emailVerified;
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to account" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Community profile</Text>
        <View style={styles.headerSpace} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarCard}>
          <AvatarImage avatarUrl={profile.avatarUrl} displayName={profile.displayName} size={112} />
          <Text style={styles.avatarTitle}>Your on-air identity</Text>
          <Text style={styles.avatarCopy}>This image and name appear beside your messages across StreamTumi communities.</Text>
          <View style={styles.avatarActions}>
            <Pressable disabled={busy || !verified} onPress={() => void chooseAvatar()} style={[styles.photoButton, (!verified || busy) && styles.disabled]}>
              <Ionicons name="images-outline" size={17} color={colors.text} />
              <Text style={styles.photoButtonText}>{profile.avatarUrl ? "Replace photo" : "Choose photo"}</Text>
            </Pressable>
            {profile.avatarUrl ? (
              <Pressable disabled={busy || !verified} onPress={() => void removeAvatar()} style={[styles.removeButton, (!verified || busy) && styles.disabled]}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            autoCapitalize="words"
            editable={!busy && verified}
            maxLength={32}
            onChangeText={setDisplayName}
            placeholder="Your display name"
            placeholderTextColor={colors.faint}
            style={commonStyles.field}
            value={displayName}
          />
          <Text style={styles.help}>2-32 characters. Platform authority names are reserved.</Text>
          {!verified ? <Text style={styles.notice}>Verify your email before changing your public profile.</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Pressable disabled={busy || !verified || displayName === profile.displayName} onPress={() => void saveName()} style={[commonStyles.button, (busy || !verified || displayName === profile.displayName) && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={commonStyles.buttonText}>Save profile</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  headerSpace: { width: 42 },
  content: { padding: 18, paddingBottom: 50, gap: 18 },
  avatarCard: { alignItems: "center", borderRadius: 24, padding: 24, gap: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  avatarTitle: { marginTop: 6, color: colors.text, fontSize: 20, fontWeight: "900" },
  avatarCopy: { maxWidth: 320, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  avatarActions: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8 },
  photoButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 13, paddingHorizontal: 15, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
  photoButtonText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  removeButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, paddingHorizontal: 14 },
  removeButtonText: { color: "#ff9584", fontSize: 13, fontWeight: "800" },
  form: { gap: 10, borderRadius: 20, padding: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  help: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  notice: { color: colors.warning, fontSize: 12, lineHeight: 18, backgroundColor: "#292313", borderRadius: 10, padding: 10 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.48 },
});
