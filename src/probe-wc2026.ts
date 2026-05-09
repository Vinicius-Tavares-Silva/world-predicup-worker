import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";
import { Wc2026Provider } from "./providers/wc2026.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();

  if (config.sportsDataProvider !== "wc2026") {
    throw new Error("Set SPORTS_DATA_PROVIDER=wc2026 before running this probe");
  }

  const provider = new Wc2026Provider({
    ...config,
    wc2026UseTestEndpoint: true,
  });
  const [snapshot] = await provider.getLiveMatches();

  console.log("WC2026 test match:");
  console.log(`${snapshot.homeTeam.name} ${snapshot.score.home} x ${snapshot.score.away} ${snapshot.awayTeam.name}`);
  console.log(`status=${snapshot.status} period=${snapshot.period} minute=${snapshot.minute ?? "n/a"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
