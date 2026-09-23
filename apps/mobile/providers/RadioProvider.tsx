import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { z } from "zod";
import { clearPausedRadio, getPausedRadio, setPausedRadio } from "@/lib/storage";

const radioSnapshotSchema = z.object({
  token: z.string().min(1),
  stationName: z.string(),
  streamUrl: z.string().url(),
  generation: z.string().default("legacy"),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  artworkUrl: z.string().url().nullable(),
});

export type RadioSnapshot = z.infer<typeof radioSnapshotSchema>;

type RadioContextValue = {
  current: RadioSnapshot | null;
  playing: boolean;
  buffering: boolean;
  error: string | null;
  play: (snapshot: RadioSnapshot) => void;
  pause: () => void;
  resume: () => void;
  update: (snapshot: RadioSnapshot) => void;
  stop: () => void;
};

const RadioContext = createContext<RadioContextValue | null>(null);

export function RadioProvider({ children }: PropsWithChildren) {
  const player = useAudioPlayer(null, { updateInterval: 750, preferredForwardBufferDuration: 12 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<RadioSnapshot | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    let active = true;
    void getPausedRadio().then((raw) => {
      if (!active || !raw) return;
      try {
        const restored = radioSnapshotSchema.safeParse(JSON.parse(raw));
        if (!restored.success) return;
        setCurrent(restored.data);
        player.replace({ uri: restored.data.streamUrl, name: restored.data.stationName });
        player.setActiveForLockScreen(true, metadata(restored.data));
      } catch {
        void clearPausedRadio();
      }
    });
    return () => {
      active = false;
    };
  }, [player]);

  function persist(snapshot: RadioSnapshot) {
    void setPausedRadio(JSON.stringify(snapshot));
  }

  function play(snapshot: RadioSnapshot) {
    const parsed = radioSnapshotSchema.parse(snapshot);
    if (current?.streamUrl !== parsed.streamUrl || current.generation !== parsed.generation) {
      player.replace({ uri: parsed.streamUrl, name: parsed.stationName });
    }
    setCurrent(parsed);
    persist(parsed);
    player.setActiveForLockScreen(true, metadata(parsed));
    player.play();
  }

  function pause() {
    player.pause();
    if (current) persist(current);
  }

  function resume() {
    if (!current) return;
    player.setActiveForLockScreen(true, metadata(current));
    player.play();
  }

  function update(snapshot: RadioSnapshot) {
    if (current?.token !== snapshot.token) return;
    const parsed = radioSnapshotSchema.parse(snapshot);
    const streamChanged = current.streamUrl !== parsed.streamUrl || current.generation !== parsed.generation;
    setCurrent(parsed);
    persist(parsed);
    if (streamChanged) {
      player.replace({ uri: parsed.streamUrl, name: parsed.stationName });
      if (status.playing) player.play();
    }
    player.updateLockScreenMetadata(metadata(parsed));
  }

  function stop() {
    player.pause();
    player.clearLockScreenControls();
    player.replace(null);
    setCurrent(null);
    void clearPausedRadio();
  }

  return (
    <RadioContext.Provider
      value={{
        current,
        playing: status.playing,
        buffering: status.isBuffering,
        error: status.error,
        play,
        pause,
        resume,
        update,
        stop,
      }}
    >
      {children}
    </RadioContext.Provider>
  );
}

function metadata(snapshot: RadioSnapshot) {
  return {
    title: snapshot.title || snapshot.stationName,
    artist: snapshot.artist || snapshot.stationName,
    albumTitle: snapshot.album || "Live on StreamTumi",
    artworkUrl: snapshot.artworkUrl ?? undefined,
  };
}

export function useRadio(): RadioContextValue {
  const value = useContext(RadioContext);
  if (!value) throw new Error("useRadio must be used inside RadioProvider.");
  return value;
}
