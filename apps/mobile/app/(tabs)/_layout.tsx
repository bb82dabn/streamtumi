import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

const icons = {
  index: ["home", "home-outline"],
  guide: ["grid", "grid-outline"],
  fans: ["heart", "heart-outline"],
  account: ["person", "person-outline"],
} as const;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#090c0f",
          borderTopColor: colors.border,
          height: 66,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", paddingBottom: 4 },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons name={focused ? pair[0] : pair[1]} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="guide" options={{ title: "Guide" }} />
      <Tabs.Screen name="fans" options={{ title: "Fans" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
