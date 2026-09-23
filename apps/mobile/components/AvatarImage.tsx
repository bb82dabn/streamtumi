import { Image, StyleSheet, Text, View } from "react-native";
import { absoluteUrl } from "@/lib/api";
import { colors } from "@/lib/theme";

type Props = {
  avatarUrl: string | null | undefined;
  displayName: string;
  size: number;
};

export function AvatarImage({ avatarUrl, displayName, size }: Props) {
  const frameStyle = { width: size, height: size, borderRadius: Math.round(size * 0.34) };
  if (avatarUrl) {
    return (
      <Image
        accessibilityLabel={`${displayName}'s avatar`}
        resizeMode="cover"
        source={{ uri: absoluteUrl(avatarUrl) }}
        style={[styles.frame, frameStyle]}
      />
    );
  }
  return (
    <View accessibilityLabel={`${displayName}'s avatar`} style={[styles.frame, styles.fallback, frameStyle]}>
      <Text style={[styles.initial, { fontSize: Math.max(13, Math.round(size * 0.38)) }]}>{Array.from(displayName.trim())[0]?.toLocaleUpperCase() ?? "S"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3a1b16",
  },
  initial: {
    color: colors.text,
    fontWeight: "900",
  },
});
