import { StyleSheet } from "react-native";

export const colors = {
  background: "#050708",
  panel: "#0d1114",
  panelRaised: "#141a1e",
  border: "#263039",
  text: "#f6f7f8",
  muted: "#98a2aa",
  faint: "#65717a",
  accent: "#ff4d32",
  accentDark: "#9f2418",
  radio: "#43d7c3",
  warning: "#f4bd50",
  success: "#64d88a",
  black: "#000000",
  white: "#ffffff",
} as const;

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 150,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  quietButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 18,
  },
  quietButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  field: {
    minHeight: 52,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingHorizontal: 15,
    fontSize: 16,
  },
});
