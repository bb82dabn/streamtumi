"use client";

import { useCallback, useState } from "react";
import { StationChat } from "@/components/station-chat";
import { TvPlayer } from "@/components/tv-player";

export function WatchExperience({ token }: { token: string }) {
  const [currentVideo, setCurrentVideo] = useState<{ id: string; title: string } | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const updateCount = useCallback((count: number) => setViewerCount(count), []);
  const markAccessReady = useCallback(() => setAccessReady(true), []);
  const refreshStation = useCallback(() => setRefreshVersion((value) => value + 1), []);
  return <main className="watch-page"><div className="watch-layout">
    <TvPlayer token={token} viewerCount={viewerCount} refreshVersion={refreshVersion} onProgramChange={setCurrentVideo} onAccessReady={markAccessReady} />
    {accessReady ? <StationChat token={token} currentVideo={currentVideo} onViewerCount={updateCount} onStationUpdated={refreshStation} /> : <aside className="chat-panel chat-locked"><MessagePlaceholder /></aside>}
  </div></main>;
}

function MessagePlaceholder() {
  return <div className="empty"><h2>Station chat</h2><p>Chat becomes available after station access is confirmed.</p></div>;
}
