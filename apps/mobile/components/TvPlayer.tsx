import { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { VideoAirPlayButton, VideoView, useVideoPlayer } from "expo-video";
import type { PersonalizedWeatherPlayback, TvPlaylistItem, TvStationResponse } from "@streamtumi/contracts";
import { absoluteUrl } from "@/lib/api";
import { colors } from "@/lib/theme";
import { ScreenState } from "@/components/ScreenState";

export function TvPlayer({ state, stationUrl, weatherPlayback }: { state: TvStationResponse; stationUrl: string; weatherPlayback?: PersonalizedWeatherPlayback | null }) {
  const position = state.position;
  const item = position ? state.playlist[position.index] : undefined;
  const channelDelivery = state.delivery?.mode === "CHANNEL_HLS" ? state.delivery : null;
  const channelPath = channelDelivery?.status === "AVAILABLE" ? channelDelivery.hlsUrl : undefined;
  const channelProgram = channelDelivery ? state.program : undefined;
  const weatherMode = state.station.playbackKind === "PERSONALIZED_WEATHER";
  const programTitle = weatherMode ? "Your local forecast" : channelProgram?.title ?? item?.title;
  const programPresenter = weatherMode ? "WeatherStar 4000+ 16:9" : "";
  if (!state.online || (weatherMode ? !weatherPlayback : channelDelivery ? !channelPath : !item || !position)) {
    return (
      <View style={styles.offline}>
        <ScreenState title="Broadcast off air" message="This channel has no active program right now." />
      </View>
    );
  }
  const offsetSeconds = (position?.playbackOffsetMs ?? 0) / 1000;
  return (
    <View>
      {weatherMode && weatherPlayback ? (
        <ChannelPlayback
          key={weatherPlayback.sessionId}
          channelPath={weatherPlayback.hlsUrl}
          programPresenter="WeatherStar 4000+"
          programTitle="Your local forecast"
          stationName={state.station.name}
          stationUrl={stationUrl}
        />
      ) : channelPath && channelDelivery ? (
        <ChannelPlayback
          key={channelDelivery.version}
          channelPath={channelPath}
          programPresenter={programPresenter}
          programTitle={programTitle ?? state.station.name}
          stationName={state.station.name}
          stationUrl={stationUrl}
        />
      ) : (
        <TvPlayback
          key={`${item!.id}:${position!.cycleNumber ?? 0}`}
          item={item!}
          offsetSeconds={offsetSeconds}
          stationUrl={stationUrl}
        />
      )}
      <View style={styles.programBar}>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        <View style={styles.programCopy}>
          <Text numberOfLines={1} style={styles.programTitle}>{programTitle}</Text>
          <Text style={styles.programMeta}>{programPresenter || "Synchronized broadcast"}</Text>
        </View>
        <View style={styles.outputControls}>
          {Platform.OS === "ios" ? (
            <VideoAirPlayButton style={styles.airplay} tint={colors.text} activeTint={colors.accent} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ChannelPlayback({
  channelPath,
  programPresenter,
  programTitle,
  stationName,
  stationUrl,
}: {
  channelPath: string;
  programPresenter: string;
  programTitle: string;
  stationName: string;
  stationUrl: string;
}) {
  const player = useVideoPlayer({
    uri: absoluteUrl(channelPath, stationUrl),
    contentType: "hls",
    metadata: { title: programTitle, artist: programPresenter || stationName },
  }, (videoPlayer) => {
    videoPlayer.allowsExternalPlayback = true;
    videoPlayer.audioMixingMode = "doNotMix";
    videoPlayer.keepScreenOnWhilePlaying = true;
    videoPlayer.play();
  });

  return <TvVideoView player={player} />;
}

function TvPlayback({ item, offsetSeconds, stationUrl }: { item: TvPlaylistItem; offsetSeconds: number; stationUrl: string }) {
  const player = useVideoPlayer({
    uri: absoluteUrl(item.hlsUrl, stationUrl),
    contentType: "hls",
    metadata: { title: item.title, artist: "StreamTumi Live" },
  }, (videoPlayer) => {
    videoPlayer.allowsExternalPlayback = true;
    videoPlayer.audioMixingMode = "doNotMix";
    videoPlayer.currentTime = offsetSeconds;
    videoPlayer.keepScreenOnWhilePlaying = true;
    videoPlayer.play();
  });

  useEffect(() => {
    const drift = offsetSeconds - player.currentTime;
    if (Math.abs(drift) > 8) player.seekBy(drift);
  }, [offsetSeconds, player]);

  return <TvVideoView player={player} />;
}

function TvVideoView({ player }: { player: ReturnType<typeof useVideoPlayer> }) {
  return (
    <VideoView
      allowsPictureInPicture
      contentFit="contain"
      fullscreenOptions={{ enable: true, orientation: "landscape", keepFullscreenOnPiPStop: "autoEnter" }}
      nativeControls
      player={player}
      requiresLinearPlayback
      startsPictureInPictureAutomatically
      style={styles.video}
    />
  );
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.black,
  },
  offline: {
    aspectRatio: 16 / 9,
    backgroundColor: colors.black,
  },
  programBar: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  liveText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  programCopy: {
    flex: 1,
  },
  programTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  programMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  airplay: {
    width: 28,
    height: 28,
  },
  outputControls: {
    flexDirection: "row",
    alignItems: "center",
  },
});
