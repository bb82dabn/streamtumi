import { Ionicons } from "@expo/vector-icons";
import { emailVerificationTokenSchema } from "@streamtumi/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Brand } from "@/components/Brand";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

type VerificationState = "READY" | "VERIFYING" | "VERIFIED" | "ERROR";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const linkedToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const { ready, session, resendEmailVerification, verifyEmail } = useAuth();
  const [token, setToken] = useState(linkedToken ?? "");
  const [state, setState] = useState<VerificationState>("READY");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const attemptedToken = useRef("");

  useEffect(() => {
    if (!linkedToken || !ready || !session || attemptedToken.current === linkedToken) return;
    attemptedToken.current = linkedToken;
    void Promise.resolve().then(async () => {
      if (!emailVerificationTokenSchema.safeParse(linkedToken).success) {
        setState("ERROR");
        setMessage("This verification link is not valid.");
        return;
      }
      if (session.emailVerified) {
        setState("VERIFIED");
        setMessage("Your email is verified. Community actions are now available.");
        return;
      }
      setState("VERIFYING");
      setMessage("");
      try {
        await verifyEmail(linkedToken);
        setState("VERIFIED");
        setMessage("Your email is verified. Community actions are now available.");
      } catch (caught) {
        setState("ERROR");
        setMessage(caught instanceof Error ? caught.message : "Email verification failed.");
      }
    });
  }, [linkedToken, ready, session, verifyEmail]);

  async function submitToken() {
    setState("VERIFYING");
    setMessage("");
    try {
      await verifyEmail(token.trim());
      setState("VERIFIED");
      setMessage("Your email is verified. Community actions are now available.");
    } catch (caught) {
      setState("ERROR");
      setMessage(caught instanceof Error ? caught.message : "Email verification failed.");
    }
  }

  async function resend() {
    setResending(true);
    setMessage("");
    try {
      await resendEmailVerification();
      setState("READY");
      setMessage("If verification is still required, a new email is on its way.");
    } catch (caught) {
      setState("ERROR");
      setMessage(caught instanceof Error ? caught.message : "The verification email could not be sent.");
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Brand />
        <View style={styles.card}>
          <View style={[styles.icon, state === "VERIFIED" && styles.verifiedIcon]}>
            {state === "VERIFYING" ? <ActivityIndicator color={colors.accent} /> : (
              <Ionicons name={state === "VERIFIED" ? "shield-checkmark" : "mail-unread-outline"} size={30} color={state === "VERIFIED" ? colors.success : colors.accent} />
            )}
          </View>
          <Text style={styles.eyebrow}>{state === "VERIFIED" ? "Verification complete" : "Community access"}</Text>
          <Text style={styles.title}>{state === "VERIFIED" ? "You are cleared to join in" : "Verify your email"}</Text>
          <Text style={styles.copy}>
            {session ? `We sent a single-use link to ${session.email}. It expires after 30 minutes.` : "Sign in to the account that requested this verification link."}
          </Text>
          {message ? <Text accessibilityLiveRegion="polite" style={state === "ERROR" ? styles.error : styles.notice}>{message}</Text> : null}
          {ready && !session ? (
            <Pressable onPress={() => router.replace("/login")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Sign in</Text></Pressable>
          ) : null}
          {session && !session.emailVerified && state !== "VERIFIED" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Verification token</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={43}
                  onChangeText={setToken}
                  placeholder="Paste the token from your email"
                  placeholderTextColor={colors.faint}
                  style={commonStyles.field}
                  value={token}
                />
              </View>
              <Pressable disabled={state === "VERIFYING" || token.trim().length !== 43} onPress={() => void submitToken()} style={[commonStyles.button, (state === "VERIFYING" || token.trim().length !== 43) && styles.disabled]}>
                <Text style={commonStyles.buttonText}>{state === "VERIFYING" ? "Verifying..." : "Verify email"}</Text>
              </Pressable>
              <Pressable disabled={resending} onPress={() => void resend()} style={[commonStyles.quietButton, resending && styles.disabled]}>
                <Text style={commonStyles.quietButtonText}>{resending ? "Requesting..." : "Send a new email"}</Text>
              </Pressable>
            </>
          ) : null}
          {session && (session.emailVerified || state === "VERIFIED") ? (
            <Pressable onPress={() => router.replace("/(tabs)/account")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Continue to account</Text></Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 44, gap: 30 },
  card: { marginTop: "auto", marginBottom: "auto", gap: 16, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 24 },
  icon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#2c1713", borderWidth: 1, borderColor: "#5c2c23" },
  verifiedIcon: { backgroundColor: "#12251c", borderColor: "#24583b" },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -1 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  fieldGroup: { gap: 8, marginTop: 4 },
  label: { color: colors.text, fontSize: 12, fontWeight: "800" },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#12251c", padding: 11 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  disabled: { opacity: 0.48 },
});
