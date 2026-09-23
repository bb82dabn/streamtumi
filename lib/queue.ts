import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";

export type TranscodeJob = { videoId: string };
export type RadioPrepJob = { trackId: string; kind?: "PREPARE" | "BACKFILL_HLS" };
export type MediaProcessingJob = { processingJobId: string };
export type WeatherRenderJob = { feedKey: string; zipCode: string };

const globalForQueue = globalThis as unknown as {
  channelLoopQueue?: Queue<TranscodeJob>;
  streamTumiRadioPrepQueue?: Queue<RadioPrepJob>;
  channelLoopMediaProcessingQueue?: Queue<MediaProcessingJob>;
  streamTumiWeatherRenderQueue?: Queue<WeatherRenderJob>;
};

export function getTranscodeQueue(): Queue<TranscodeJob> {
  if (!globalForQueue.channelLoopQueue) {
    globalForQueue.channelLoopQueue = new Queue<TranscodeJob>("transcode", {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.channelLoopQueue;
}

export function getRadioPrepQueue(): Queue<RadioPrepJob> {
  if (!globalForQueue.streamTumiRadioPrepQueue) {
    globalForQueue.streamTumiRadioPrepQueue = new Queue<RadioPrepJob>("radio-prep", {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.streamTumiRadioPrepQueue;
}

export function getMediaProcessingQueue(): Queue<MediaProcessingJob> {
  if (!globalForQueue.channelLoopMediaProcessingQueue) {
    globalForQueue.channelLoopMediaProcessingQueue = new Queue<MediaProcessingJob>("media-processing", {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.channelLoopMediaProcessingQueue;
}

export function getWeatherRenderQueue(): Queue<WeatherRenderJob> {
  if (!globalForQueue.streamTumiWeatherRenderQueue) {
    globalForQueue.streamTumiWeatherRenderQueue = new Queue<WeatherRenderJob>("weather-render", {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.streamTumiWeatherRenderQueue;
}
