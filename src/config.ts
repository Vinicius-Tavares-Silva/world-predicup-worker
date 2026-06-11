export interface WorkerConfig {
  worldPredicupApiBaseUrl: string;
  worldPredicupWebhookToken: string;
  sportsDataProvider: "mock" | "api-football" | "wc2026";
  sportsDataApiKey: string;
  apiFootballBaseUrl: string;
  apiFootballLeagueId: number;
  apiFootballSeason: number;
  apiFootballLiveScope: string;
  wc2026BaseUrl: string;
  wc2026UseTestEndpoint: boolean;
  wc2026SchedulePath?: string;
  pollIntervalLiveSeconds: number;
  pollIntervalPreMatchSeconds: number;
  stateDbPath: string;
  dryRun: boolean;
  webhookPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const dryRun = parseBoolean(env.DRY_RUN, true);
  const sportsDataProvider = readProvider(env.SPORTS_DATA_PROVIDER);

  const config: WorkerConfig = {
    worldPredicupApiBaseUrl: readString(env, "WORLD_PREDICUP_API_BASE_URL", dryRun ? "http://localhost:54321" : undefined),
    worldPredicupWebhookToken: readString(env, "WORLD_PREDICUP_WEBHOOK_TOKEN", dryRun ? "dry-run-token" : undefined),
    sportsDataProvider,
    sportsDataApiKey: readString(env, "SPORTS_DATA_API_KEY", sportsDataProvider === "mock" ? "mock-key" : undefined),
    apiFootballBaseUrl: readString(env, "API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io"),
    apiFootballLeagueId: readPositiveInteger(env, "API_FOOTBALL_LEAGUE_ID", 1),
    apiFootballSeason: readPositiveInteger(env, "API_FOOTBALL_SEASON", 2026),
    apiFootballLiveScope: readString(env, "API_FOOTBALL_LIVE_SCOPE", "1"),
    wc2026BaseUrl: readString(env, "WC2026_API_BASE_URL", "https://api.wc2026api.com"),
    wc2026UseTestEndpoint: parseBoolean(env.WC2026_USE_TEST_ENDPOINT, false),
    wc2026SchedulePath: readOptionalString(env, "WC2026_SCHEDULE_PATH"),
    pollIntervalLiveSeconds: readPositiveInteger(env, "POLL_INTERVAL_LIVE_SECONDS", 60),
    pollIntervalPreMatchSeconds: readPositiveInteger(env, "POLL_INTERVAL_PRE_MATCH_SECONDS", 300),
    stateDbPath: readString(env, "STATE_DB_PATH", "./data/worker.sqlite"),
    dryRun,
    webhookPath: readString(env, "WORLD_PREDICUP_WEBHOOK_PATH", "/functions/v1/live-match-webhook"),
  };

  if (!config.dryRun) {
    assertUrl(config.worldPredicupApiBaseUrl, "WORLD_PREDICUP_API_BASE_URL");
  }
  assertUrl(config.apiFootballBaseUrl, "API_FOOTBALL_BASE_URL");
  assertUrl(config.wc2026BaseUrl, "WC2026_API_BASE_URL");

  return config;
}

function readProvider(value: string | undefined): WorkerConfig["sportsDataProvider"] {
  if (!value || value === "mock") return "mock";
  if (value === "api-football") return value;
  if (value === "wc2026") return value;
  throw new Error(`Unsupported SPORTS_DATA_PROVIDER "${value}". Supported providers: mock, api-football, wc2026`);
}

function readString(env: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const value = env[key]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function readOptionalString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function readPositiveInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function assertUrl(value: string, key: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
}
