import { db } from "@/lib/db";
import { prepareStaticTvTransition } from "@/lib/tv-transition-filler";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usage = "Usage: npm run tv:prepare-transition -- <station-uuid>";

export function parseTvTransitionArguments(argv: string[]): string {
  if (argv.length !== 1 || !uuid.test(argv[0])) throw new Error(usage);
  return argv[0];
}

async function main(): Promise<void> {
  const result = await prepareStaticTvTransition(parseTvTransitionArguments(process.argv.slice(2)));
  console.info(`${result.created ? "Prepared" : "Reused"} ${result.durationMs}ms audiovisual static generation ${result.generation} for station ${result.stationId}.`);
}

const entryPoint = process.argv[1];
if (entryPoint?.endsWith("prepare-tv-transition.ts")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
