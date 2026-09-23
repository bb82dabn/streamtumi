import { Ionicons } from "@expo/vector-icons";
import { useEffect, useEffectEvent } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogStation, RadioStationResponse } from "@streamtumi/contracts";
import { absoluteUrl } from "@/lib/api";
import { colors } from "@/lib/theme";
import { useRadio, type RadioSnapshot } from "@/providers/RadioProvider";

export function RadioPlayer({ station, state, stationUrl }: { station: CatalogStation; state: RadioStationResponse; stationUrl: string }) {
  const radio = useRadio();
  const streamPath = state.stream?.audioHlsUrl;
  const artworkPath = state.playback.artworkUrl;
  const artworkUrl = artworkPath ? absoluteUrl(artworkPath, stationUrl) : station.artworkUrl;
  const snapshot: RadioSnapshot | null = streamPath ? {
    token: station.token,
    stationName: station.name,
    streamUrl: absoluteUrl(streamPath, stationUrl),
    generation: state.stream?.sessionId || state.releaseId || "clock",
    title: state.playback.title || station.name,
    artist: state.playback.artist || station.ownerName,
    album: state.playback.album || "Live on StreamTumi",
    artworkUrl,
  } : null;
  const selected = radio.current?.token === station.token;

  const updateFromEffect = useEffectEvent(() => {
    if (snapshot && selected) radio.update(snapshot);
  });

  useEffect(() => {
    const update = setTimeout(updateFromEffect, 0);
    return () => clearTimeout(update);
  }, [snapshot?.album, snapshot?.artist, snapshot?.artworkUrl, snapshot?.generation, snapshot?.streamUrl, snapshot?.title, selected]);

  function toggle() {
    if (!snapshot) return;
    if (selected && radio.playing) radio.pause();
    else if (selected) radio.resume();
    else radio.play(snapshot);
  }

  const streamReady = state.stream?.status === "AVAILABLE" && Boolean(snapshot);
  return (
    <View style={styles.stage}>
      <View style={styles.artShell}>
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} style={styles.art} resizeMode="cover" />
        ) : (
          <View style={styles.artFallback}>
            <View style={styles.ringLarge} />
            <View style={styles.ringSmall} />
            <Ionicons name="radio" size={64} color={colors.radio} />
          </View>
        )}
      </View>
      <Text style={styles.kicker}>Now playing</Text>
      <Text numberOfLines={2} style={styles.title}>{state.playback.title || station.name}</Text>
      <Text numberOfLines={1} style={styles.artist}>{state.playback.artist || "Live Radio"}</Text>
      {state.next?.title ? (
        <Text numberOfLines={1} style={styles.next}>Next: {state.next.artist ? `${state.next.artist} / ` : ""}{state.next.title}</Text>
      ) : null}
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          disabled={!streamReady}
          onPress={toggle}
          style={({ pressed }) => [styles.play, (!streamReady || pressed) && styles.dim]}
        >
          <Ionicons
            name={selected && radio.playing ? "pause" : "play"}
            size={29}
            color={colors.white}
            style={selected && radio.playing ? undefined : styles.playIcon}
          />
        </Pressable>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, state.online && styles.statusOnline]} />
        <Text style={styles.statusText}>
          {state.stream?.status === "AVAILABLE" ? (radio.buffering && selected ? "Buffering live feed" : "Clock-synchronized audio") : state.stream?.status === "FAILED" ? "Stream unavailable" : "Stream starting"}
        </Text>
      </View>
      {selected && radio.error ? <Text style={styles.error}>{radio.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 30,
  },
  artShell: {
    width: "76%",
    maxWidth: 310,
    aspectRatio: 1,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#0c2422",
    borderWidth: 1,
    borderColor: "#24554f",
    marginBottom: 24,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  artFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ringLarge: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: "#2b6e65",
  },
  ringSmall: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: "#40998e",
  },
  kicker: {
    color: colors.radio,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
    textAlign: "center",
    marginTop: 8,
  },
  artist: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 5,
  },
  next: {
    color: colors.faint,
    fontSize: 12,
    marginTop: 10,
    maxWidth: "90%",
  },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
  },
  playIcon: {
    marginLeft: 4,
  },
  dim: {
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  statusOnline: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  error: {
    color: "#ff9584",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
});
