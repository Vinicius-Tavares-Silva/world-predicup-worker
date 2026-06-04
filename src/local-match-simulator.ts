import { loadEnvFiles } from "./env-file.js";
import { buildWebhookUrl } from "./webhook-client.js";
import type { MatchPeriod, MatchStatus, WebhookPayload } from "./types.js";

type MatchRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  stage: string;
  status: string;
  official_home_score: number | null;
  official_away_score: number | null;
  home_team: { id: string; name: string } | null;
  away_team: { id: string; name: string } | null;
};

type SimulationArgs = {
  match: string;
  event: "start" | "live" | "finish";
  homeScore: number;
  awayScore: number;
  minute: number;
  externalMatchId?: string;
  provider: string;
  reset: boolean;
};

loadEnvFiles();

const supabaseUrl = process.env.WORLD_PREDICUP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey =
  process.env.WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhookToken = process.env.WORLD_PREDICUP_WEBHOOK_TOKEN ?? "local-worker-webhook-token";
const webhookPath = process.env.WORLD_PREDICUP_WEBHOOK_PATH ?? "/functions/v1/live-match-webhook";

if (!serviceRoleKey) {
  throw new Error("Missing WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const match = await resolveMatch(args.match);
  const externalMatchId = args.externalMatchId ?? `local-sim-${match.id}`;

  await upsertMapping(args.provider, externalMatchId, match.id);

  if (args.reset) {
    await resetMatch(match.id);
  }

  const payload = buildPayload(args, match, externalMatchId);
  const idempotencyKey = [
    "local-sim",
    args.provider,
    externalMatchId,
    args.event,
    args.minute,
    args.homeScore,
    args.awayScore,
    Date.now(),
  ].join(":");

  await sendWebhook(payload, idempotencyKey);

  const updated = await getMatch(match.id);
  console.log(JSON.stringify({
    ok: true,
    event: args.event,
    match: {
      ordinalOrId: args.match,
      id: updated.id,
      home: updated.home_team?.name,
      away: updated.away_team?.name,
      status: updated.status,
      official_home_score: updated.official_home_score,
      official_away_score: updated.official_away_score,
    },
    externalMatchId,
  }, null, 2));
}

function buildPayload(args: SimulationArgs, match: MatchRow, externalMatchId: string): WebhookPayload {
  return {
    source: args.provider,
    type: "match_snapshot",
    externalMatchId,
    matchId: match.id,
    status: statusForEvent(args.event),
    minute: args.minute,
    period: periodForEvent(args.event, args.minute),
    homeTeam: {
      id: match.home_team_id,
      name: match.home_team?.name ?? "Home Team",
    },
    awayTeam: {
      id: match.away_team_id,
      name: match.away_team?.name ?? "Away Team",
    },
    score: {
      home: args.homeScore,
      away: args.awayScore,
    },
    events: [],
    occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };
}

function parseArgs(args: string[]): SimulationArgs {
  const values = new Map<string, string | boolean>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      values.set(key, true);
    }
  }

  const match = stringArg(values, "match");
  const event = stringArg(values, "event", "live");
  if (event !== "start" && event !== "live" && event !== "finish") {
    throw new Error("--event must be start, live, or finish");
  }

  return {
    match,
    event,
    homeScore: numberArg(values, "home", event === "start" ? 0 : 2),
    awayScore: numberArg(values, "away", event === "start" ? 0 : 1),
    minute: numberArg(values, "minute", defaultMinute(event)),
    externalMatchId: optionalStringArg(values, "external-id"),
    provider: stringArg(values, "provider", "local-sim"),
    reset: booleanArg(values, "reset", event === "start"),
  };
}

function stringArg(values: Map<string, string | boolean>, key: string, fallback?: string): string {
  const value = values.get(key);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required --${key}`);
}

function optionalStringArg(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberArg(values: Map<string, string | boolean>, key: string, fallback: number): number {
  const value = values.get(key);
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
}

function booleanArg(values: Map<string, string | boolean>, key: string, fallback: boolean): boolean {
  const value = values.get(key);
  if (value === undefined) return fallback;
  if (value === true) return true;
  if (value === false) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function defaultMinute(event: SimulationArgs["event"]): number {
  if (event === "start") return 1;
  if (event === "finish") return 90;
  return 67;
}

function statusForEvent(event: SimulationArgs["event"]): MatchStatus {
  if (event === "finish") return "finished";
  return "live";
}

function periodForEvent(event: SimulationArgs["event"], minute: number): MatchPeriod {
  if (event === "finish") return "full_time";
  if (minute <= 45) return "first_half";
  return "second_half";
}

async function resolveMatch(matchArg: string): Promise<MatchRow> {
  if (/^[0-9]+$/.test(matchArg)) {
    const ordinal = Number(matchArg);
    if (!Number.isInteger(ordinal) || ordinal <= 0) {
      throw new Error("--match ordinal must be a positive number");
    }

    const rows = await supabaseFetch<MatchRow[]>(
      `/rest/v1/matches?select=${matchSelect()}&home_team_id=not.is.null&away_team_id=not.is.null&order=match_date.asc&limit=1&offset=${ordinal - 1}`,
    );
    const match = rows[0];
    if (!match) throw new Error(`No match found at ordinal ${ordinal}`);
    return match;
  }

  return getMatch(matchArg);
}

async function getMatch(matchId: string): Promise<MatchRow> {
  const rows = await supabaseFetch<MatchRow[]>(
    `/rest/v1/matches?select=${matchSelect()}&id=eq.${encodeURIComponent(matchId)}&limit=1`,
  );
  const match = rows[0];
  if (!match) throw new Error(`Match not found: ${matchId}`);
  return match;
}

function matchSelect(): string {
  return "id,home_team_id,away_team_id,match_date,stage,status,official_home_score,official_away_score,home_team:teams!matches_home_team_id_fkey(id,name),away_team:teams!matches_away_team_id_fkey(id,name)";
}

async function resetMatch(matchId: string): Promise<void> {
  await supabaseFetch(`/rest/v1/matches?id=eq.${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    body: {
      status: "scheduled",
      official_home_score: null,
      official_away_score: null,
      winner_team_id: null,
      updated_at: new Date().toISOString(),
    },
  });
}

async function upsertMapping(provider: string, externalMatchId: string, matchId: string): Promise<void> {
  await supabaseFetch("/rest/v1/match_provider_mappings?on_conflict=provider,external_match_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      provider,
      external_match_id: externalMatchId,
      match_id: matchId,
      updated_at: new Date().toISOString(),
    },
  });
}

async function sendWebhook(payload: WebhookPayload, idempotencyKey: string): Promise<void> {
  const response = await fetch(buildWebhookUrl(supabaseUrl, webhookPath), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${webhookToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Webhook failed with ${response.status}: ${text}`);
  }
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
