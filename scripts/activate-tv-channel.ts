import { db } from "@/lib/db";
import { parseTvChannelActivationArguments, setTvChannelActivation } from "@/lib/tv-channel-activation";

async function main(): Promise<void> {
  const result = await setTvChannelActivation(parseTvChannelActivationArguments(process.argv.slice(2)));
  if (result.disabled) {
    console.info(`Disabled CHANNEL_HLS for ${result.name}.`);
    return;
  }
  console.info(result.scheduleId
    ? `Activated CHANNEL_HLS for ${result.name} in ${result.renditionMode} mode with pinned schedule ${result.scheduleId}.`
    : `Activated CHANNEL_HLS for empty station ${result.name} in ${result.renditionMode} mode without a schedule.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
