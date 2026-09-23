import { Ionicons } from "@expo/vector-icons";
import {
  communityReportReasons,
  communityReportRequestSchema,
  communityReportResponseSchema,
  type CommunityReportReason,
} from "@streamtumi/contracts";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { jsonRequest, requestJson, withQueryParameter } from "@/lib/api";
import { colors } from "@/lib/theme";

type ReportSubject = {
  type: "STATION" | "CHAT_MESSAGE";
  id?: string;
  context: string;
};

const reasonLabels: Record<CommunityReportReason, string> = {
  ILLEGAL_CONTENT: "Potentially illegal content",
  CHILD_SAFETY: "Child safety",
  INTELLECTUAL_PROPERTY: "Copyright or intellectual property",
  VIOLENCE_OR_THREATS: "Violence or threats",
  HATE_OR_HARASSMENT: "Hate or harassment",
  SPAM_OR_SCAM: "Spam or scam",
  OTHER: "Other",
};

export function ReportModal({
  grant,
  onClose,
  stationToken,
  subject,
  visible,
}: {
  grant?: string | null;
  onClose: () => void;
  stationToken: string;
  subject: ReportSubject;
  visible: boolean;
}) {
  const [reason, setReason] = useState<CommunityReportReason>("HATE_OR_HARASSMENT");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  function reset() {
    setReason("HATE_OR_HARASSMENT");
    setDetails("");
    setError("");
    setReference("");
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const input = communityReportRequestSchema.parse({
        subjectType: subject.type,
        messageId: subject.type === "CHAT_MESSAGE" ? subject.id : undefined,
        reason,
        details,
      });
      const path = `/api/mobile/v1/stations/${encodeURIComponent(stationToken)}/reports`;
      const endpoint = grant ? withQueryParameter(path, "grant", grant) : path;
      const result = await requestJson(
        endpoint,
        communityReportResponseSchema,
        jsonRequest(input, { method: "POST" }),
      );
      setReference(result.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} onShow={reset} presentationStyle="pageSheet" visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Safety report</Text>
            <Text style={styles.title}>Report {subject.type === "CHAT_MESSAGE" ? "message" : "station"}</Text>
          </View>
          <Pressable accessibilityLabel="Close report" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={23} color={colors.text} />
          </Pressable>
        </View>
        {reference ? (
          <View style={styles.confirmation}>
            <View style={styles.confirmationIcon}><Ionicons name="checkmark" size={30} color={colors.success} /></View>
            <Text style={styles.confirmationTitle}>Report submitted</Text>
            <Text style={styles.copy}>A moderator or authorized review service will assess the captured content.</Text>
            <View style={styles.reference}><Text style={styles.referenceLabel}>Reference</Text><Text selectable style={styles.referenceValue}>{reference}</Text></View>
            <Pressable onPress={onClose} style={styles.submit}><Text style={styles.submitText}>Done</Text></Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.subjectCard}>
              <Ionicons name={subject.type === "CHAT_MESSAGE" ? "chatbubble-outline" : "radio-outline"} size={19} color={colors.accent} />
              <View style={styles.subjectCopy}><Text style={styles.subjectLabel}>Reporting</Text><Text numberOfLines={2} style={styles.subjectText}>{subject.context}</Text></View>
            </View>
            <Text style={styles.label}>Reason</Text>
            <View style={styles.reasons}>
              {communityReportReasons.map((value) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === value }}
                  key={value}
                  onPress={() => setReason(value)}
                  style={[styles.reason, reason === value && styles.reasonSelected]}
                >
                  <View style={[styles.radio, reason === value && styles.radioSelected]}>{reason === value ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={[styles.reasonText, reason === value && styles.reasonTextSelected]}>{reasonLabels[value]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>What happened?</Text>
            <TextInput
              maxLength={2000}
              multiline
              onChangeText={setDetails}
              placeholder="Describe the content and why it should be reviewed."
              placeholderTextColor={colors.faint}
              style={styles.details}
              textAlignVertical="top"
              value={details}
            />
            <Text style={styles.help}>Use at least 10 characters. Do not reproduce illegal material. If someone is in immediate danger, contact local emergency services.</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <Pressable disabled={busy || details.trim().length < 10} onPress={() => void submit()} style={[styles.submit, (busy || details.trim().length < 10) && styles.disabled]}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Submit report</Text>}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 21, fontWeight: "900", marginTop: 2 },
  close: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  content: { padding: 18, paddingBottom: 60, gap: 12 },
  subjectCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 14, marginBottom: 4 },
  subjectCopy: { flex: 1 },
  subjectLabel: { color: colors.faint, fontSize: 9, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  subjectText: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18, marginTop: 3 },
  label: { color: colors.text, fontSize: 13, fontWeight: "900", marginTop: 5 },
  reasons: { gap: 7 },
  reason: { minHeight: 47, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 13 },
  reasonSelected: { borderColor: colors.accent, backgroundColor: "#231411" },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.faint, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  reasonText: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: "700" },
  reasonTextSelected: { color: colors.text },
  details: { minHeight: 130, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, fontSize: 14, lineHeight: 20, padding: 14 },
  help: { color: colors.faint, fontSize: 10, lineHeight: 16 },
  error: { color: "#ff9584", fontSize: 12, lineHeight: 18, borderRadius: 11, backgroundColor: "#2b1110", padding: 11 },
  submit: { minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, marginTop: 4 },
  submitText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  confirmation: { flex: 1, justifyContent: "center", padding: 28, gap: 13 },
  confirmationIcon: { width: 62, height: 62, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#12251c", borderWidth: 1, borderColor: "#285338" },
  confirmationTitle: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  reference: { borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 15, marginVertical: 4 },
  referenceLabel: { color: colors.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  referenceValue: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 1, marginTop: 5 },
});
