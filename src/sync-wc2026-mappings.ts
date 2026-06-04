import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";

type Wc2026Match = {
  id: number | string;
  home_team?: string;
  away_team?: string;
  kickoff_utc?: string;
  date?: string;
};

type WorldPredicupMatch = {
  id: string;
  match_date: string;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

type MatchedMapping = {
  externalMatchId: string;
  matchId: string;
  providerHome: string;
  providerAway: string;
  appHome: string;
  appAway: string;
  kickoffAt: string;
  reversed: boolean;
};

type UnmatchedProviderMatch = {
  externalMatchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  reason: string;
};

const provider = "wc2026";
let config: ReturnType<typeof loadConfig>;
let supabaseUrl: string;
let serviceRoleKey: string;
let shouldWrite = false;

async function main(): Promise<void> {
  loadRuntimeConfig();

  const [providerMatches, appMatches] = await Promise.all([
    fetchWc2026Matches(),
    fetchWorldPredicupMatches(),
  ]);

  const matchIndex = indexWorldPredicupMatches(appMatches);
  const matched: MatchedMapping[] = [];
  const unmatched: UnmatchedProviderMatch[] = [];
  const ambiguous: UnmatchedProviderMatch[] = [];

  for (const match of providerMatches) {
    const externalMatchId = String(match.id);
    const homeTeam = match.home_team?.trim() ?? "";
    const awayTeam = match.away_team?.trim() ?? "";
    const kickoffAt = match.kickoff_utc ?? match.date ?? "";

    if (!homeTeam || !awayTeam || !kickoffAt) {
      unmatched.push({ externalMatchId, homeTeam, awayTeam, kickoffAt, reason: "missing provider team/date fields" });
      continue;
    }

    const kickoffKey = normalizeInstant(kickoffAt);
    const homeKey = teamKey(homeTeam);
    const awayKey = teamKey(awayTeam);
    const directKey = matchKey(kickoffKey, homeKey, awayKey);
    const reversedKey = matchKey(kickoffKey, awayKey, homeKey);
    const directMatches = matchIndex.get(directKey) ?? [];
    const reversedMatches = matchIndex.get(reversedKey) ?? [];

    if (directMatches.length === 1) {
      matched.push(toMapping(match, directMatches[0], false));
      continue;
    }

    if (directMatches.length > 1) {
      ambiguous.push({ externalMatchId, homeTeam, awayTeam, kickoffAt, reason: "multiple direct app matches" });
      continue;
    }

    if (reversedMatches.length === 1) {
      matched.push(toMapping(match, reversedMatches[0], true));
      continue;
    }

    if (reversedMatches.length > 1) {
      ambiguous.push({ externalMatchId, homeTeam, awayTeam, kickoffAt, reason: "multiple reversed app matches" });
      continue;
    }

    unmatched.push({ externalMatchId, homeTeam, awayTeam, kickoffAt, reason: "no app match found" });
  }

  if (shouldWrite && matched.length > 0) {
    await upsertMappings(matched);
  }

  printSummary({ fetched: providerMatches.length, matched, unmatched, ambiguous });

  if (unmatched.length > 0 || ambiguous.length > 0) {
    process.exitCode = 1;
  }
}

function loadRuntimeConfig(): void {
  loadEnvFiles();

  config = loadConfig({
    ...process.env,
    SPORTS_DATA_PROVIDER: "wc2026",
  });

  const resolvedSupabaseUrl = process.env.WORLD_PREDICUP_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const resolvedServiceRoleKey =
    process.env.WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!resolvedSupabaseUrl) {
    throw new Error("Missing WORLD_PREDICUP_SUPABASE_URL or SUPABASE_URL");
  }

  if (!resolvedServiceRoleKey) {
    throw new Error("Missing WORLD_PREDICUP_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  supabaseUrl = resolvedSupabaseUrl;
  serviceRoleKey = resolvedServiceRoleKey;
  shouldWrite = process.env.SYNC_WC2026_MAPPINGS_WRITE === "true";
}

async function fetchWc2026Matches(): Promise<Wc2026Match[]> {
  const response = await fetch(new URL("/matches", withTrailingSlash(config.wc2026BaseUrl)), {
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

  return parsed as Wc2026Match[];
}

async function fetchWorldPredicupMatches(): Promise<WorldPredicupMatch[]> {
  return supabaseFetch<WorldPredicupMatch[]>(
    "/rest/v1/matches?select=id,match_date,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name)&home_team_id=not.is.null&away_team_id=not.is.null&order=match_date.asc",
  );
}

export function indexWorldPredicupMatches(matches: WorldPredicupMatch[]): Map<string, WorldPredicupMatch[]> {
  const index = new Map<string, WorldPredicupMatch[]>();

  for (const match of matches) {
    if (!match.home_team?.name || !match.away_team?.name) continue;

    const key = matchKey(
      normalizeInstant(match.match_date),
      teamKey(match.home_team.name),
      teamKey(match.away_team.name),
    );
    const bucket = index.get(key) ?? [];
    bucket.push(match);
    index.set(key, bucket);
  }

  return index;
}

function toMapping(match: Wc2026Match, appMatch: WorldPredicupMatch, reversed: boolean): MatchedMapping {
  return {
    externalMatchId: String(match.id),
    matchId: appMatch.id,
    providerHome: match.home_team ?? "",
    providerAway: match.away_team ?? "",
    appHome: appMatch.home_team?.name ?? "",
    appAway: appMatch.away_team?.name ?? "",
    kickoffAt: match.kickoff_utc ?? match.date ?? "",
    reversed,
  };
}

async function upsertMappings(mappings: MatchedMapping[]): Promise<void> {
  await supabaseFetch(
    "/rest/v1/match_provider_mappings?on_conflict=provider,external_match_id",
    {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: mappings.map((mapping) => ({
        provider,
        external_match_id: mapping.externalMatchId,
        match_id: mapping.matchId,
        updated_at: new Date().toISOString(),
      })),
    },
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

function printSummary(input: {
  fetched: number;
  matched: MatchedMapping[];
  unmatched: UnmatchedProviderMatch[];
  ambiguous: UnmatchedProviderMatch[];
}): void {
  const reversed = input.matched.filter((match) => match.reversed);
  console.log(`WC2026 matches fetched: ${input.fetched}`);
  console.log(`Mappings ${shouldWrite ? "upserted" : "matched dry-run"}: ${input.matched.length}`);
  console.log(`Reversed team-order matches: ${reversed.length}`);
  console.log(`Unmatched: ${input.unmatched.length}`);
  console.log(`Ambiguous: ${input.ambiguous.length}`);

  if (reversed.length > 0) {
    console.log("\nReversed matches:");
    for (const match of reversed) {
      console.log(`- ${match.externalMatchId} ${match.providerHome} vs ${match.providerAway} -> ${match.appHome} vs ${match.appAway}`);
    }
  }

  if (input.unmatched.length > 0) {
    console.log("\nUnmatched provider matches:");
    for (const match of input.unmatched) {
      console.log(`- ${match.externalMatchId} ${match.kickoffAt} ${match.homeTeam} vs ${match.awayTeam}: ${match.reason}`);
    }
  }

  if (input.ambiguous.length > 0) {
    console.log("\nAmbiguous provider matches:");
    for (const match of input.ambiguous) {
      console.log(`- ${match.externalMatchId} ${match.kickoffAt} ${match.homeTeam} vs ${match.awayTeam}: ${match.reason}`);
    }
  }
}

export function matchKey(kickoffAt: string, homeTeam: string, awayTeam: string): string {
  return `${kickoffAt}|${homeTeam}|${awayTeam}`;
}

export function normalizeInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim();
  }
  return date.toISOString();
}

export function teamKey(value: string): string {
  const canonical = teamAliases.get(normalizeText(value)) ?? value;
  return normalizeText(canonical);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

const teamAliases = new Map<string, string>([
  ["algeria", "Argélia"],
  ["argelia", "Argélia"],
  ["argentina", "Argentina"],
  ["australia", "Austrália"],
  ["austria", "Áustria"],
  ["belgium", "Bélgica"],
  ["belgica", "Bélgica"],
  ["bosnia and herzegovina", "Bósnia e Herzegovina"],
  ["bosnia herzegovina", "Bósnia e Herzegovina"],
  ["bosnia e herzegovina", "Bósnia e Herzegovina"],
  ["brazil", "Brasil"],
  ["brasil", "Brasil"],
  ["canada", "Canadá"],
  ["cape verde", "Cabo Verde"],
  ["cabo verde", "Cabo Verde"],
  ["colombia", "Colômbia"],
  ["cote d ivoire", "Costa do Marfim"],
  ["ivory coast", "Costa do Marfim"],
  ["costa do marfim", "Costa do Marfim"],
  ["croatia", "Croácia"],
  ["croacia", "Croácia"],
  ["curacao", "Curaçao"],
  ["czechia", "Tchéquia"],
  ["czech republic", "Tchéquia"],
  ["tchequia", "Tchéquia"],
  ["dr congo", "RD Congo"],
  ["d r congo", "RD Congo"],
  ["democratic republic of congo", "RD Congo"],
  ["rd congo", "RD Congo"],
  ["ecuador", "Equador"],
  ["equador", "Equador"],
  ["egypt", "Egito"],
  ["egito", "Egito"],
  ["england", "Inglaterra"],
  ["inglaterra", "Inglaterra"],
  ["france", "França"],
  ["franca", "França"],
  ["germany", "Alemanha"],
  ["alemanha", "Alemanha"],
  ["ghana", "Gana"],
  ["gana", "Gana"],
  ["haiti", "Haiti"],
  ["iran", "Irã"],
  ["ira", "Irã"],
  ["iraq", "Iraque"],
  ["iraque", "Iraque"],
  ["japan", "Japão"],
  ["japao", "Japão"],
  ["jordan", "Jordânia"],
  ["jordania", "Jordânia"],
  ["mexico", "México"],
  ["marrocos", "Marrocos"],
  ["morocco", "Marrocos"],
  ["netherlands", "Holanda"],
  ["holanda", "Holanda"],
  ["new zealand", "Nova Zelândia"],
  ["nova zelandia", "Nova Zelândia"],
  ["norway", "Noruega"],
  ["noruega", "Noruega"],
  ["panama", "Panamá"],
  ["paraguay", "Paraguai"],
  ["paraguai", "Paraguai"],
  ["portugal", "Portugal"],
  ["qatar", "Catar"],
  ["catar", "Catar"],
  ["saudi arabia", "Arábia Saudita"],
  ["arabia saudita", "Arábia Saudita"],
  ["scotland", "Escócia"],
  ["escocia", "Escócia"],
  ["senegal", "Senegal"],
  ["south africa", "África do Sul"],
  ["africa do sul", "África do Sul"],
  ["south korea", "Coreia do Sul"],
  ["korea republic", "Coreia do Sul"],
  ["coreia do sul", "Coreia do Sul"],
  ["spain", "Espanha"],
  ["espanha", "Espanha"],
  ["sweden", "Suécia"],
  ["suecia", "Suécia"],
  ["switzerland", "Suíça"],
  ["suica", "Suíça"],
  ["tunisia", "Tunísia"],
  ["turkiye", "Turquia"],
  ["turkey", "Turquia"],
  ["turquia", "Turquia"],
  ["united states", "EUA"],
  ["united states of america", "EUA"],
  ["usa", "EUA"],
  ["eua", "EUA"],
  ["uruguay", "Uruguai"],
  ["uruguai", "Uruguai"],
  ["uzbekistan", "Uzbequistão"],
  ["uzbequistao", "Uzbequistão"],
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
