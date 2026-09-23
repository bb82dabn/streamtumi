import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register, registrationEnabled } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register" && registrationEnabled;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (registering) {
        await register({ displayName, email, password });
        router.replace("/verify-email");
      } else {
        await login({ email, password });
        router.replace("/(tabs)/account");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.form}>
        <View style={styles.introIcon}>
          <Ionicons name={registering ? "person-add-outline" : "key-outline"} size={26} color={colors.accent} />
        </View>
        <Text style={commonStyles.title}>{registering ? "Join the audience" : "Welcome back"}</Text>
        <Text style={commonStyles.subtitle}>
          {registering ? "Create your profile and keep your favorite stations close." : "Sign in to sync fan stations and join live chat."}
        </Text>
        {registering ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              autoCapitalize="words"
              autoComplete="name"
              maxLength={80}
              onChangeText={setDisplayName}
              placeholder="Your on-air name"
              placeholderTextColor={colors.faint}
              style={commonStyles.field}
              value={displayName}
            />
          </View>
        ) : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.faint}
            style={commonStyles.field}
            value={email}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete={registering ? "new-password" : "current-password"}
            onChangeText={setPassword}
            placeholder={registering ? "At least 10 characters" : "Your password"}
            placeholderTextColor={colors.faint}
            secureTextEntry
            style={commonStyles.field}
            value={password}
          />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Pressable disabled={busy} onPress={() => void submit()} style={({ pressed }) => [commonStyles.button, (busy || pressed) && styles.dim]}>
          <Text style={commonStyles.buttonText}>{busy ? "Connecting..." : registering ? "Create account" : "Sign in"}</Text>
        </Pressable>
        {!registering ? (
          <Pressable onPress={() => router.push("/forgot-password")} style={styles.switch}>
            <Text style={styles.switchText}>Forgot your password?</Text>
          </Pressable>
        ) : null}
        {(registering || registrationEnabled) ? (
          <Pressable onPress={() => router.replace(registering ? "/login" : "/register")} style={styles.switch}>
            <Text style={styles.switchText}>{registering ? "Already have an account? Sign in" : "New to StreamTumi? Create an account"}</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  form: {
    gap: 18,
    paddingHorizontal: 22,
    paddingTop: 42,
    paddingBottom: 40,
  },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2c1713",
    borderWidth: 1,
    borderColor: "#5c2c23",
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: "#ff9584",
    lineHeight: 20,
    backgroundColor: "#2b1110",
    borderRadius: 12,
    padding: 12,
  },
  dim: {
    opacity: 0.65,
  },
  switch: {
    padding: 10,
    alignItems: "center",
  },
  switchText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
});
