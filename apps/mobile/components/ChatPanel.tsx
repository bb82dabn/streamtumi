import { Ionicons } from "@expo/vector-icons";
import { communityBlockResponseSchema, type CatalogStation } from "@streamtumi/contracts";
import { router } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { z } from "zod";
import { absoluteUrl, jsonRequest, requestJson, withQueryParameter } from "@/lib/api";
import { colors } from "@/lib/theme";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/providers/AuthProvider";
import { AvatarImage } from "@/components/AvatarImage";
import { ReportModal } from "@/components/ReportModal";

const messageSchema = z.object({
  id: z.string(),
  authorKind: z.enum(["GUEST", "REGISTERED", "HOST"]),
  authorName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  body: z.string(),
  createdAt: z.string().datetime(),
  pinnedAt: z.string().datetime().nullable(),
  hidden: z.boolean(),
});
const viewerSchema = z.object({
  kind: z.enum(["GUEST", "REGISTERED", "HOST"]),
  displayName: z.string(),
  canModerate: z.boolean(),
});
const chatSchema = z.object({
  messages: z.array(messageSchema),
  pinned: z.array(messageSchema),
  viewer: viewerSchema.nullable(),
});
const sendSchema = z.object({ message: messageSchema });
const engagementMetricsSchema = z.object({
  fanCount: z.number().int().nonnegative(),
  ratingAverage: z.number().nonnegative(),
  ratingCount: z.number().int().nonnegative(),
  isFan: z.boolean(),
  viewerRating: z.number().int().min(1).max(5).nullable(),
});
const engagementSchema = engagementMetricsSchema.extend({
  public: z.boolean(),
  signedIn: z.boolean(),
  isOwner: z.boolean(),
});

type ChatData = z.infer<typeof chatSchema>;
type EngagementData = z.infer<typeof engagementSchema>;

export function ChatPanel({ grant, station }: { grant?: string | null; station: CatalogStation }) {
  const { session } = useAuth();
  const [data, setData] = useState<ChatData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState<z.infer<typeof messageSchema> | null>(null);
  const communityPath = `/api/mobile/v1/stations/${encodeURIComponent(station.token)}`;
  const communityRoot = grant ? withQueryParameter(absoluteUrl(communityPath), "grant", grant) : communityPath;

  function communityUrl(path: string): string {
    if (!grant) return `${communityPath}${path}`;
    const url = new URL(communityRoot);
    url.pathname = `${url.pathname}${path}`;
    return url.toString();
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      setData(await requestJson(communityUrl("/chat/messages"), chatSchema, { cache: "no-store" }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chat could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadEngagement() {
    try {
      setEngagement(await requestJson(communityUrl("/engagement"), engagementSchema, { cache: "no-store" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Station community could not be loaded.");
    }
  }

  const loadFromEffect = useEffectEvent(load);
  const loadEngagementFromEffect = useEffectEvent(loadEngagement);

  useEffect(() => {
    const initial = setTimeout(() => {
      void loadFromEffect();
      void loadEngagementFromEffect();
    }, 0);
    const poll = setInterval(() => void loadFromEffect(true), 8_000);
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [station.token, session?.id]);

  async function toggleFan() {
    if (!engagement) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(
        communityUrl("/fan"),
        engagementMetricsSchema,
        { method: engagement.isFan ? "DELETE" : "PUT" },
      );
      setEngagement((current) => current ? { ...current, ...result } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fan status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseRating(rating: number) {
    if (!engagement) return;
    setBusy(true);
    setError("");
    try {
      const removing = engagement.viewerRating === rating;
      const result = await requestJson(
        communityUrl("/rating"),
        engagementMetricsSchema,
        removing ? { method: "DELETE" } : jsonRequest({ rating }, { method: "PUT" }),
      );
      setEngagement((current) => current ? { ...current, ...result } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rating could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const message = body.trim();
    if (!message) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson(communityUrl("/chat/messages"), sendSchema, jsonRequest({ body: message }, { method: "POST" }));
      setData((current) => current ? { ...current, messages: [...current.messages, result.message] } : current);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  function block(message: z.infer<typeof messageSchema>) {
    Alert.alert(
      `Block ${message.authorName}?`,
      "Their existing messages and pinned posts will be hidden from your signed-in chat history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            setError("");
            void requestJson(
              communityUrl(`/chat/messages/${encodeURIComponent(message.id)}/block`),
              communityBlockResponseSchema,
              { method: "PUT" },
            )
              .then(async () => {
                await load(true);
                Alert.alert("User blocked", `${message.authorName} is now hidden from your chat history.`);
              })
              .catch((caught) => setError(caught instanceof Error ? caught.message : "This user could not be blocked."))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  if (loading) return <ScreenState loading title="Opening live chat" message="Connecting to the station conversation." />;
  if (!data && error) return <ScreenState title="Chat unavailable" message={error} actionLabel="Try again" onAction={() => void load()} />;

  return (
    <View style={styles.wrap}>
      {engagement ? (
        <View style={styles.community}>
          <View style={styles.communitySummary}>
            <View style={styles.communityMetric}>
              <Ionicons name={engagement.isFan ? "heart" : "heart-outline"} size={17} color={colors.accent} />
              <Text style={styles.communityValue}>{engagement.fanCount}</Text>
              <Text style={styles.communityLabel}>{engagement.fanCount === 1 ? "fan" : "fans"}</Text>
            </View>
            <View style={styles.communityMetric}>
              <Ionicons name={engagement.ratingCount ? "star" : "star-outline"} size={17} color={colors.warning} />
              <Text style={styles.communityValue}>{engagement.ratingCount ? engagement.ratingAverage.toFixed(1) : "New"}</Text>
              <Text style={styles.communityLabel}>{engagement.ratingCount ? `${engagement.ratingCount} ratings` : "No ratings"}</Text>
            </View>
          </View>
          {engagement.public && !engagement.isOwner && session?.emailVerified ? (
            <View style={styles.communityActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: engagement.isFan, disabled: busy }}
                disabled={busy}
                onPress={() => void toggleFan()}
                style={[styles.fanButton, engagement.isFan && styles.fanButtonActive, busy && styles.disabled]}
              >
                <Ionicons name={engagement.isFan ? "heart" : "heart-outline"} size={16} color={engagement.isFan ? colors.white : colors.accent} />
                <Text style={[styles.fanButtonText, engagement.isFan && styles.fanButtonTextActive]}>{engagement.isFan ? "Fan" : "Become a fan"}</Text>
              </Pressable>
              <View accessibilityLabel="Rate this station" style={styles.ratingButtons}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Pressable
                    accessibilityLabel={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: engagement.viewerRating === rating, disabled: busy }}
                    disabled={busy}
                    key={rating}
                    onPress={() => void chooseRating(rating)}
                    style={styles.ratingButton}
                  >
                    <Ionicons name={(engagement.viewerRating ?? 0) >= rating ? "star" : "star-outline"} size={19} color={colors.warning} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : engagement.isOwner ? <Text style={styles.communityNote}>This is your station.</Text> : null}
        </View>
      ) : null}
      {data?.pinned.length ? (
        <View style={styles.pinned}>
          <Ionicons name="pin" size={15} color={colors.warning} />
          <Text numberOfLines={2} style={styles.pinnedText}><Text style={styles.bold}>{data.pinned[0]?.authorName}: </Text>{data.pinned[0]?.body}</Text>
        </View>
      ) : null}
      {!data?.messages.length ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={30} color={colors.faint} />
          <Text style={styles.emptyTitle}>Start the conversation</Text>
          <Text style={styles.emptyCopy}>Be the first person in the room to say hello.</Text>
        </View>
      ) : (
        <View style={styles.messages}>
          {data.messages.filter((message) => !message.hidden).slice(-100).map((message) => (
            <View key={message.id} style={styles.messageRow}>
              <AvatarImage avatarUrl={message.avatarUrl} displayName={message.authorName} size={36} />
              <View style={styles.message}>
                <View style={styles.messageHead}>
                  <Text style={styles.author}>{message.authorName}</Text>
                  {message.authorKind === "HOST" ? <Text style={styles.host}>HOST</Text> : null}
                  <Text style={styles.time}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
                </View>
                <Text style={styles.messageBody}>{message.body}</Text>
                <View style={styles.messageActions}>
                  {session?.emailVerified ? (
                    <Pressable disabled={busy} onPress={() => block(message)} style={styles.messageAction}>
                      <Ionicons name="ban-outline" size={14} color={colors.muted} />
                      <Text style={styles.messageActionText}>Block</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setReportMessage(message)} style={styles.messageAction}>
                    <Ionicons name="flag-outline" size={14} color={colors.muted} />
                    <Text style={styles.messageActionText}>Report</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {data?.viewer && session?.emailVerified ? (
        <View style={styles.composer}>
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setBody}
            placeholder={`Message as ${data.viewer.displayName}`}
            placeholderTextColor={colors.faint}
            style={styles.input}
            value={body}
          />
          <Pressable disabled={busy || !body.trim()} onPress={() => void send()} style={styles.send}>
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
      ) : !session ? (
        <View style={styles.join}>
          <Text style={styles.joinTitle}>Sign in to join the conversation</Text>
          <Text style={styles.joinCopy}>You can read every message as a guest. A registered account is required to post, rate, or become a fan.</Text>
          <Pressable onPress={() => router.push("/login")} style={styles.signInButton}>
            <Text style={styles.signInButtonText}>Sign in</Text>
          </Pressable>
        </View>
      ) : !session.emailVerified ? (
        <View style={styles.join}>
          <Text style={styles.joinTitle}>Verify your email to participate</Text>
          <Text style={styles.joinCopy}>Email verification is required before you can post, rate, or become a fan.</Text>
        </View>
      ) : (
        <View style={styles.join}>
          <Text style={styles.joinTitle}>Chat identity unavailable</Text>
          <Text style={styles.joinCopy}>Refresh the station to reconnect your account.</Text>
        </View>
      )}
      <ReportModal
        grant={grant}
        onClose={() => setReportMessage(null)}
        stationToken={station.token}
        subject={{
          type: "CHAT_MESSAGE",
          id: reportMessage?.id,
          context: reportMessage ? `${reportMessage.authorName}: ${reportMessage.body}` : "Chat message",
        }}
        visible={reportMessage != null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 18,
    paddingBottom: 150,
    gap: 14,
  },
  community: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 13,
    gap: 12,
  },
  communitySummary: {
    flexDirection: "row",
    gap: 18,
  },
  communityMetric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  communityValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  communityLabel: {
    color: colors.faint,
    fontSize: 10,
  },
  communityActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fanButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 12,
  },
  fanButtonActive: {
    backgroundColor: colors.accent,
  },
  fanButtonText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  fanButtonTextActive: {
    color: colors.white,
  },
  ratingButtons: {
    flexDirection: "row",
  },
  ratingButton: {
    width: 30,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  communityNote: {
    color: colors.muted,
    fontSize: 11,
  },
  disabled: {
    opacity: 0.55,
  },
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 13,
    backgroundColor: "#292313",
    borderWidth: 1,
    borderColor: "#514622",
    padding: 12,
  },
  pinnedText: {
    flex: 1,
    color: "#e7d6aa",
    fontSize: 12,
    lineHeight: 18,
  },
  bold: {
    fontWeight: "800",
  },
  empty: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
  },
  messages: {
    gap: 8,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  message: {
    flex: 1,
    borderRadius: 14,
    padding: 13,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  author: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  host: {
    color: colors.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  time: {
    color: colors.faint,
    fontSize: 10,
    marginLeft: "auto",
  },
  messageBody: {
    color: "#d4d9dd",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  messageActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 14,
    marginTop: 9,
  },
  messageAction: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  messageActionText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  error: {
    color: "#ff9584",
    fontSize: 12,
    backgroundColor: "#2b1110",
    borderRadius: 10,
    padding: 10,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.panel,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  join: {
    gap: 9,
    paddingTop: 4,
  },
  joinTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  joinCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  signInButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.accent,
  },
  signInButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
});
