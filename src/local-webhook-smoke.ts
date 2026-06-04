import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFiles } from "./env-file.js";
import { createProvider } from "./provider.js";
import { runWorkerOnce } from "./runner.js";
import { SqliteStateStore } from "./state/sqlite-state-store.js";
import { WebhookClient } from "./webhook-client.js";
import { loadConfig } from "./config.js";

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  status: string;
  official_home_score: number | null;
  official_away_score: number | null;
  home_team: { id: string; name: string } | null;
  away_team: { id: string; name: string } | null;
};

loadEnvFiles();

const supabaseUrl = process.env.WORLD_PREDICUP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey =
  process.env.WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookToken = process.env.WORLD_PREDICUP_WEBHOOK_TOKEN ?? "local-worker-webhook-token";

if (!serviceRoleKey) {
  throw new Error("Missing WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
}

async function main(): Promise<void> {
  const match = await selectLocalMatch();
  const externalMatchId = `mock-${match.id}`;

  await resetMatch(match.id);
  await upsertMapping(externalMatchId, match.id);
  await deleteReceipt(`snapshot:mock:${externalMatchId}:67:2:1:live`);
  await deleteReceipt(`event:mock:${externalMatchId}:mock-goal-bra-66`);

  process.env.DRY_RUN = "false";
  process.env.SPORTS_DATA_PROVIDER = "mock";
  process.env.WORLD_PREDICUP_API_BASE_URL = supabaseUrl;
  process.env.WORLD_PREDICUP_WEBHOOK_PATH = "/functions/v1/live-match-webhook";
  process.env.WORLD_PREDICUP_WEBHOOK_TOKEN = webhookToken;
  process.env.STATE_DB_PATH = join(mkdtempSync(join(tmpdir(), "world-predicup-worker-")), "worker.sqlite");
  process.env.MOCK_MATCH_EXTERNAL_ID = externalMatchId;
  process.env.MOCK_MATCH_ID = match.id;
  process.env.MOCK_HOME_TEAM_ID = match.home_team_id;
  process.env.MOCK_HOME_TEAM_NAME = match.home_team?.name ?? "Home Team";
  process.env.MOCK_AWAY_TEAM_ID = match.away_team_id;
  process.env.MOCK_AWAY_TEAM_NAME = match.away_team?.name ?? "Away Team";
  process.env.MOCK_KICKOFF_AT = match.match_date;
  process.env.MOCK_MATCH_MINUTE = "67";

  const config = loadConfig();
  const stateStore = new SqliteStateStore(config.stateDbPath);
  try {
    await runWorkerOnce({
      provider: createProvider(config),
      stateStore,
      webhookClient: new WebhookClient(config),
      now: new Date(match.match_date),
    });
  } finally {
    stateStore.close();
  }

  const updated = await getMatch(match.id);
  if (
    updated.status !== "in_progress" ||
    updated.official_home_score !== 2 ||
    updated.official_away_score !== 1
  ) {
    throw new Error(
      `Smoke test failed for ${match.id}: got ${updated.status} ${updated.official_home_score}-${updated.official_away_score}`,
    );
  }

  console.log(`Local worker webhook smoke test passed: ${match.id} ${updated.status} 2-1`);
}

async function selectLocalMatch(): Promise<MatchRow> {
  const rows = await supabaseFetch<MatchRow[]>(
    "/rest/v1/matches?select=id,home_team_id,away_team_id,match_date,status,official_home_score,official_away_score,home_team:teams!matches_home_team_id_fkey(id,name),away_team:teams!matches_away_team_id_fkey(id,name)&stage=eq.group_stage&home_team_id=not.is.null&away_team_id=not.is.null&order=match_date.asc&limit=1",
  );
  const match = rows[0];
  if (!match) {
    throw new Error("No local group-stage match with both teams found. Has the World Predicup Supabase schema been seeded?");
  }
  return match;
}

async function getMatch(matchId: string): Promise<MatchRow> {
  const rows = await supabaseFetch<MatchRow[]>(
    `/rest/v1/matches?select=id,home_team_id,away_team_id,match_date,status,official_home_score,official_away_score,home_team:teams!matches_home_team_id_fkey(id,name),away_team:teams!matches_away_team_id_fkey(id,name)&id=eq.${encodeURIComponent(matchId)}&limit=1`,
  );
  const match = rows[0];
  if (!match) throw new Error(`Match not found after worker run: ${matchId}`);
  return match;
}

async function resetMatch(matchId: string): Promise<void> {
  await supabaseFetch(
    `/rest/v1/matches?id=eq.${encodeURIComponent(matchId)}`,
    {
      method: "PATCH",
      body: {
        status: "scheduled",
        official_home_score: null,
        official_away_score: null,
        winner_team_id: null,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

async function upsertMapping(externalMatchId: string, matchId: string): Promise<void> {
  await supabaseFetch(
    "/rest/v1/match_provider_mappings?on_conflict=provider,external_match_id",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        provider: "mock",
        external_match_id: externalMatchId,
        match_id: matchId,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

async function deleteReceipt(idempotencyKey: string): Promise<void> {
  await supabaseFetch(
    `/rest/v1/live_match_webhook_receipts?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}`,
    { method: "DELETE" },
  );
}

async function supabaseFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "return=minimal",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${options.method ?? "GET"} ${path} failed with ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) as T : undefined as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
