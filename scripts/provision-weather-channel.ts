import { db } from "@/lib/db";
import { provisionWeatherChannel, weatherChannelOwnerEmail } from "@/lib/weather-channel-provisioning";

async function main(): Promise<void> {
  const result = await provisionWeatherChannel(weatherChannelOwnerEmail(process.argv.slice(2)));
  console.info(`${result.created ? "Created" : "Updated"} StreamTumi Weather for ${result.ownerEmail}.`);
  console.info(`Station: ${result.stationId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
