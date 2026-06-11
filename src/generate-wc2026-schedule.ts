import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";

async function main(): Promise<void> {
  loadEnvFiles();

  const config = loadConfig({
    ...process.env,
    SPORTS_DATA_PROVIDER: "wc2026",
  });
  const outputPath = resolve(process.argv[2] ?? "data/wc2026-matches.json");
  const url = new URL("/matches", withTrailingSlash(config.wc2026BaseUrl));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.sportsDataApiKey}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`WC2026 /matches failed with ${response.status}: ${body}`);
  }

  const parsed = JSON.parse(body) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("WC2026 /matches response must be an array");
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  console.log(`Wrote ${parsed.length} WC2026 matches to ${outputPath}`);
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
