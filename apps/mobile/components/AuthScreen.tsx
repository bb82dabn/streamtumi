import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthForm } from "@/components/AuthForm";
import { colors, commonStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const { ready, registrationEnabled } = useAuth();
  const registrationUnavailable = mode === "register" && ready && !registrationEnabled;
  return (
    <SafeAreaView style={styles.safe}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {registrationUnavailable ? (
          <View style={styles.unavailable}>
            <Text style={styles.title}>Registration unavailable</Text>
            <Text style={styles.message}>This StreamTumi deployment is sign-in only. Use an existing account to continue.</Text>
            <Pressable onPress={() => router.replace("/login")} style={commonStyles.button}><Text style={commonStyles.buttonText}>Sign in</Text></Pressable>
          </View>
        ) : ready ? <AuthForm mode={mode} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  close: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", marginLeft: 18, marginTop: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  scroll: { flexGrow: 1 },
  unavailable: { flex: 1, justifyContent: "center", padding: 26, gap: 16 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900" },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
