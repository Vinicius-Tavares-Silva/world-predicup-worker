import type { WorkerConfig } from "../config.js";
import type {
  LiveDataProvider,
  MatchEventType,
  MatchPeriod,
  MatchStatus,
  ProviderFixture,
  ProviderMatchEvent,
  ProviderMatchSnapshot,
  Score,
} from "../types.js";

interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: unknown[] | Record<string, unknown>;
  results: number;
  paging: {
    current: number;
    total: number;
  };
  response: T[];
}

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
      extra: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    season: number;
  };
  teams: {
    home: ApiFootballTeam;
    away: ApiFootballTeam;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  events?: ApiFootballEvent[];
}

interface ApiFootballTeam {
  id: number;
  name: string;
  winner: boolean | null;
}

interface ApiFootballEvent {
  time: {
    elapsed: number | null;
    extra: number | null;
  };
  team: {
    id: number;
    name: string;
  };
  player: {
    id: number | null;
    name: string | null;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: string;
  detail: string;
  comments: string | null;
}

export class ApiFootballProvider implements LiveDataProvider {
  readonly name = "api-football";

  constructor(private readonly config: WorkerConfig) {}

  async getFixtures(): Promise<ProviderFixture[]> {
    const fixtures = await this.get<ApiFootballFixture>("/fixtures", {
      league: String(this.config.apiFootballLeagueId),
      season: String(this.config.apiFootballSeason),
    });

    return fixtures.map((fixture) => this.mapFixture(fixture));
  }

  async getLiveMatches(): Promise<ProviderMatchSnapshot[]> {
    const fixtures = await this.get<ApiFootballFixture>("/fixtures", {
      live: this.config.apiFootballLiveScope,
    });

    return fixtures
      .filter((fixture) => fixture.league.id === this.config.apiFootballLeagueId)
      .map((fixture) => this.mapSnapshot(fixture));
  }

  async getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot> {
    const fixtures = await this.get<ApiFootballFixture>("/fixtures", {
      id: externalMatchId,
    });
    const fixture = fixtures[0];

    if (!fixture) {
      throw new Error(`API-Football fixture not found: ${externalMatchId}`);
    }

    return this.mapSnapshot(fixture);
  }

  async getMatchEvents(externalMatchId: string): Promise<ProviderMatchEvent[]> {
    return (await this.getMatchSnapshot(externalMatchId)).events;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(path, withTrailingSlash(this.config.apiFootballBaseUrl));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": this.config.sportsDataApiKey,
        Accept: "application/json",
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`API-Football request failed with ${response.status}: ${body}`);
    }

    const parsed = JSON.parse(body) as ApiFootballResponse<T>;
    if (hasApiErrors(parsed.errors)) {
      throw new Error(`API-Football returned errors: ${JSON.stringify(parsed.errors)}`);
    }

    return parsed.response;
  }

  private mapFixture(fixture: ApiFootballFixture): ProviderFixture {
    return {
      externalMatchId: String(fixture.fixture.id),
      homeTeam: {
        id: String(fixture.teams.home.id),
        name: fixture.teams.home.name,
      },
      awayTeam: {
        id: String(fixture.teams.away.id),
        name: fixture.teams.away.name,
      },
      kickoffAt: fixture.fixture.date,
      status: mapStatus(fixture.fixture.status.short),
    };
  }

  private mapSnapshot(fixture: ApiFootballFixture): ProviderMatchSnapshot {
    const status = mapStatus(fixture.fixture.status.short);
    const minute = fixture.fixture.status.elapsed;
    const score = mapScore(fixture.goals);

    return {
      ...this.mapFixture(fixture),
      status,
      minute,
      period: mapPeriod(fixture.fixture.status.short),
      score,
      events: (fixture.events ?? []).map((event, index) => mapEvent(event, fixture.fixture.id, index, score)),
      occurredAt: new Date().toISOString(),
      raw: fixture,
    };
  }
}

function mapStatus(shortStatus: string): MatchStatus {
  if (["TBD", "NS"].includes(shortStatus)) return "scheduled";
  if (["1H", "2H", "ET", "BT", "P", "SUSP", "INT"].includes(shortStatus)) return "live";
  if (shortStatus === "HT") return "halftime";
  if (["FT", "AET", "PEN"].includes(shortStatus)) return "finished";
  if (shortStatus === "PST") return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(shortStatus)) return "cancelled";
  return "scheduled";
}

function mapPeriod(shortStatus: string): MatchPeriod {
  switch (shortStatus) {
    case "1H":
      return "first_half";
    case "HT":
      return "halftime";
    case "2H":
      return "second_half";
    case "ET":
    case "BT":
      return "extra_time";
    case "P":
      return "penalties";
    case "FT":
    case "AET":
    case "PEN":
      return "full_time";
    default:
      return "pre_match";
  }
}

function mapScore(goals: ApiFootballFixture["goals"]): Score {
  return {
    home: goals.home ?? 0,
    away: goals.away ?? 0,
  };
}

function mapEvent(event: ApiFootballEvent, fixtureId: number, index: number, score: Score): ProviderMatchEvent {
  const minute = event.time.elapsed === null
    ? null
    : event.time.extra
      ? event.time.elapsed + event.time.extra
      : event.time.elapsed;

  return {
    externalEventId: [
      fixtureId,
      event.time.elapsed ?? "na",
      event.time.extra ?? 0,
      event.team.id,
      normalizeKeyPart(event.type),
      normalizeKeyPart(event.detail),
      event.player.id ?? normalizeKeyPart(event.player.name ?? "unknown"),
      index,
    ].join(":"),
    type: mapEventType(event),
    minute,
    teamId: String(event.team.id),
    playerName: event.player.name ?? undefined,
    scoreAfterEvent: event.type === "Goal" ? score : undefined,
    occurredAt: new Date().toISOString(),
  };
}

function mapEventType(event: ApiFootballEvent): MatchEventType {
  const type = event.type.toLowerCase();
  const detail = event.detail.toLowerCase();

  if (type === "goal" && detail.includes("penalty")) return "penalty";
  if (type === "goal") return "goal";
  if (type === "card" && detail.includes("red")) return "red_card";
  if (type === "card" && detail.includes("yellow")) return "yellow_card";
  if (type === "subst") return "substitution";
  if (type === "var") return "var";

  return "var";
}

function normalizeKeyPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function hasApiErrors(errors: ApiFootballResponse<unknown>["errors"]): boolean {
  return Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
