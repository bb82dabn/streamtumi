import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MiniPlayer } from "@/components/MiniPlayer";
import { colors } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { CatalogProvider } from "@/providers/CatalogProvider";
import { HistoryProvider } from "@/providers/HistoryProvider";
import { RadioProvider } from "@/providers/RadioProvider";

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CatalogProvider>
          <HistoryProvider>
            <RadioProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  animation: "slide_from_right",
                }}
              >
                <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
                <Stack.Screen name="login" options={{ presentation: "modal" }} />
                <Stack.Screen name="register" options={{ presentation: "modal" }} />
                <Stack.Screen name="verify-email" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="forgot-password" options={{ presentation: "modal" }} />
                <Stack.Screen name="reset-password" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="security" />
                <Stack.Screen name="delete-account" />
                <Stack.Screen name="blocked-users" />
                <Stack.Screen name="activate-device" />
                <Stack.Screen name="linked-devices" />
                <Stack.Screen name="join-room" options={{ presentation: "modal" }} />
              </Stack>
              <MiniPlayer />
            </RadioProvider>
          </HistoryProvider>
        </CatalogProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default RootLayout;
