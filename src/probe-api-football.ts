import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";
import { ApiFootballProvider } from "./providers/api-football.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();

  if (config.sportsDataProvider !== "api-football") {
    throw new Error("Set SPORTS_DATA_PROVIDER=api-football before running this probe");
  }

  const provider = new ApiFootballProvider(config);
  const fixtures = await provider.getFixtures();

  console.log(`API-Football World Cup fixture count: ${fixtures.length}`);
  for (const fixture of fixtures.slice(0, 5)) {
    console.log(`${fixture.externalMatchId}: ${fixture.kickoffAt} ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} (${fixture.status})`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
