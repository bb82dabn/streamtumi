"use client";

import { TvPlayer } from "@/components/tv-player";

export function DiagnosticPreviewPlayer({ stationId }: { stationId: string }) {
  return <TvPlayer
    stateUrl={`/api/admin/stations/${stationId}/preview`}
    diagnostic
    onProgramChange={() => undefined}
    onAccessReady={() => undefined}
  />;
}
