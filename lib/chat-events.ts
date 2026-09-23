import IORedis from "ioredis";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/redis";

export type StationEvent = {
  type: "message.created" | "message.updated" | "presence" | "station.updated";
  data: unknown;
};

type Listener = (event: StationEvent) => void;
type EventState = { subscriber?: IORedis; listeners: Map<string, Set<Listener>> };
const globalEvents = globalThis as unknown as { streamTumiEvents?: EventState };
const state = globalEvents.streamTumiEvents ?? { listeners: new Map<string, Set<Listener>>() };
globalEvents.streamTumiEvents = state;

function channel(stationId: string): string {
  return `station-events:${stationId}`;
}

function subscriber(): IORedis {
  if (!state.subscriber) {
    state.subscriber = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
    state.subscriber.on("message", (name, message) => {
      try {
        const event = JSON.parse(message) as StationEvent;
        state.listeners.get(name)?.forEach((listener) => listener(event));
      } catch (error) {
        console.error("Invalid station event:", error);
      }
    });
    state.subscriber.on("error", (error) => console.error("Station event Redis error:", error.message));
  }
  return state.subscriber;
}

export async function publishStationEvent(stationId: string, event: StationEvent): Promise<void> {
  try {
    await getRedis().publish(channel(stationId), JSON.stringify(event));
  } catch (error) {
    console.error("Could not publish station event:", error instanceof Error ? error.message : error);
  }
}

export async function subscribeStationEvents(stationId: string, listener: Listener): Promise<() => Promise<void>> {
  const name = channel(stationId);
  let listeners = state.listeners.get(name);
  if (!listeners) {
    listeners = new Set();
    state.listeners.set(name, listeners);
    await subscriber().subscribe(name);
  }
  listeners.add(listener);
  return async () => {
    const current = state.listeners.get(name);
    current?.delete(listener);
    if (current?.size === 0) {
      state.listeners.delete(name);
      await state.subscriber?.unsubscribe(name);
    }
  };
}
