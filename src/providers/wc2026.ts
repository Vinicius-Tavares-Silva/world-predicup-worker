import type { WorkerConfig } from "../config.js";
import type {
  LiveDataProvider,
  MatchPeriod,
  MatchStatus,
  ProviderFixture,
  ProviderMatchEvent,
  ProviderMatchSnapshot,
} from "../types.js";

interface Wc2026Match {
  _sandbox?: boolean;
  id: number;
  match_number: number;
  round: string;
  group_name: string | null;
  home_team_id: number;
  home_team: string;
  home_team_code: string;
  away_team_id: number;
  away_team: string;
  away_team_code: string;
  kickoff_utc: string;
  home_score: number | null;
  away_score: number | null;
  home_pen: number | null;
  away_pen: number | null;
  status: "scheduled" | "live" | "completed" | string;
  phase: "PRE" | "1H" | "HT" | "2H" | "ET1" | "ET2" | "PEN" | "FT_PEN" | string;
  match_minute?: number | null;
}

export class Wc2026Provider implements LiveDataProvider {
  readonly name = "wc2026";

  constructor(private readonly config: WorkerConfig) {}

  async getFixtures(): Promise<ProviderFixture[]> {
    const matches = await this.get<Wc2026Match[]>("/matches");
    return matches.map((match) => this.mapFixture(match));
  }

  async getLiveMatches(): Promise<ProviderMatchSnapshot[]> {
    if (this.config.wc2026UseTestEndpoint) {
      return [this.mapSnapshot(await this.get<Wc2026Match>("/test/match"))];
    }

    const liveMatches = await this.get<Wc2026Match[]>("/matches", { status: "live" });
    return liveMatches.map((match) => this.mapSnapshot(match));
  }

  async getAllMatches(): Promise<ProviderMatchSnapshot[]> {
    return (await this.get<Wc2026Match[]>("/matches")).map((match) => this.mapSnapshot(match));
  }

  async getRecentlyCompletedMatches(window: { startsAt: string; endsAt: string }): Promise<ProviderMatchSnapshot[]> {
    const startsAtMs = new Date(window.startsAt).getTime();
    const endsAtMs = new Date(window.endsAt).getTime();

    return (await this.getAllMatches()).filter((match) => {
      const kickoffMs = new Date(match.kickoffAt).getTime();
      return match.status === "finished" && kickoffMs >= startsAtMs && kickoffMs <= endsAtMs;
    });
  }

  async getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot> {
    return this.mapSnapshot(await this.get<Wc2026Match>(`/matches/${externalMatchId}`));
  }

  async getMatchEvents(_externalMatchId: string): Promise<ProviderMatchEvent[]> {
    return [];
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, withTrailingSlash(this.config.wc2026BaseUrl));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.sportsDataApiKey}`,
        Accept: "application/json",
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`WC2026 API request failed with ${response.status}: ${body}`);
    }

    return JSON.parse(body) as T;
  }

  private mapFixture(match: Wc2026Match): ProviderFixture {
    return {
      externalMatchId: String(match.id),
      matchId: String(match.id),
      homeTeam: {
        id: match.home_team_code,
        name: match.home_team,
      },
      awayTeam: {
        id: match.away_team_code,
        name: match.away_team,
      },
      kickoffAt: match.kickoff_utc,
      status: mapStatus(match.status),
      stage: match.round === "group" ? "group_stage" : "knockout",
    };
  }

  private mapSnapshot(match: Wc2026Match): ProviderMatchSnapshot {
    const penaltyScore = mapPenaltyScore(match);
    const winnerTeam = inferWinnerTeam(match, penaltyScore);

    return {
      ...this.mapFixture(match),
      minute: match.match_minute ?? null,
      period: mapPeriod(match.phase, match.status),
      score: {
        home: match.home_score ?? 0,
        away: match.away_score ?? 0,
      },
      penaltyScore,
      winnerTeam,
      events: [],
      occurredAt: new Date().toISOString(),
      raw: match,
    };
  }
}

function mapStatus(status: string): MatchStatus {
  switch (status) {
    case "scheduled":
      return "scheduled";
    case "live":
      return "live";
    case "completed":
      return "finished";
    default:
      return "scheduled";
  }
}

function mapPeriod(phase: string | undefined, status: string): MatchPeriod {
  switch (phase) {
    case "PRE":
      return "pre_match";
    case "1H":
      return "first_half";
    case "HT":
      return "halftime";
    case "2H":
      return "second_half";
    case "ET1":
    case "ET2":
      return "extra_time";
    case "PEN":
    case "FT_PEN":
      return "penalties";
    default:
      if (status === "completed") return "full_time";
      return status === "live" ? "first_half" : "pre_match";
  }
}

function mapPenaltyScore(match: Wc2026Match): { home: number; away: number } | undefined {
  if (typeof match.home_pen !== "number" || typeof match.away_pen !== "number") {
    return undefined;
  }

  return {
    home: match.home_pen,
    away: match.away_pen,
  };
}

function inferWinnerTeam(match: Wc2026Match, penaltyScore: { home: number; away: number } | undefined) {
  if (
    match.round === "group" ||
    !penaltyScore ||
    typeof match.home_score !== "number" ||
    typeof match.away_score !== "number" ||
    match.home_score !== match.away_score
  ) {
    return undefined;
  }

  if (penaltyScore.home > penaltyScore.away) {
    return { id: match.home_team_code, name: match.home_team };
  }

  if (penaltyScore.away > penaltyScore.home) {
    return { id: match.away_team_code, name: match.away_team };
  }

  return undefined;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
