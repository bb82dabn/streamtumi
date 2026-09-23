import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel="StreamTumi">
      <View style={[styles.mark, compact && styles.markCompact]}>
        <View style={styles.signal} />
        <View style={[styles.signal, styles.signalMiddle]} />
        <View style={[styles.signal, styles.signalTall]} />
      </View>
      <Text style={[styles.name, compact && styles.nameCompact]}>StreamTumi</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  markCompact: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  signal: {
    width: 3,
    height: 9,
    borderRadius: 2,
    backgroundColor: colors.white,
  },
  signalMiddle: {
    height: 15,
  },
  signalTall: {
    height: 21,
  },
  name: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  nameCompact: {
    fontSize: 17,
  },
});
