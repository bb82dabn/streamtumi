import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";
import { useRadio } from "@/providers/RadioProvider";

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const { current, playing, buffering, pause, resume } = useRadio();
  if (!current) return null;
  return (
    <View style={[styles.shell, { bottom: Math.max(insets.bottom, 8) + 62 }]}>
      <Pressable
        style={styles.copy}
        onPress={() => router.push({ pathname: "/station/[token]", params: { token: current.token } })}
      >
        <View style={styles.icon}>
          <Ionicons name="radio" size={17} color={colors.radio} />
        </View>
        <View style={styles.textWrap}>
          <Text numberOfLines={1} style={styles.title}>{current.title || current.stationName}</Text>
          <Text numberOfLines={1} style={styles.meta}>{buffering ? "Buffering live audio" : current.artist || current.stationName}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={playing ? "Pause Radio" : "Resume Radio"}
        accessibilityRole="button"
        onPress={playing ? pause : resume}
        style={styles.control}
      >
        <Ionicons name={playing ? "pause" : "play"} size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 50,
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#324049",
    backgroundColor: "rgba(15,20,24,0.98)",
    flexDirection: "row",
    alignItems: "center",
    padding: 7,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#113631",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
});
