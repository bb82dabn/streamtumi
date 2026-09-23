import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, commonStyles } from "@/lib/theme";

type Props = {
  title: string;
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export function ScreenState({ title, message, loading, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        <View style={styles.icon}>
          <Ionicons name="radio-outline" color={colors.muted} size={28} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={commonStyles.quietButton}>
          <Text style={commonStyles.quietButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    padding: 34,
    gap: 12,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 8,
  },
});
