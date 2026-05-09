export type MatchStatus =
  | "scheduled"
  | "pre_match"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled";

export type MatchPeriod =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "extra_time"
  | "penalties"
  | "full_time";

export type MatchEventType =
  | "goal"
  | "penalty"
  | "red_card"
  | "yellow_card"
  | "substitution"
  | "var"
  | "halftime"
  | "full_time"
  | "extra_time"
  | "penalty_shootout_update";

export interface TeamRef {
  id: string;
  name: string;
}

export interface Score {
  home: number;
  away: number;
}

export interface ProviderFixture {
  externalMatchId: string;
  matchId?: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  kickoffAt: string;
  status: MatchStatus;
}

export interface ProviderMatchEvent {
  externalEventId: string;
  type: MatchEventType;
  minute: number | null;
  teamId?: string;
  playerName?: string;
  scoreAfterEvent?: Score;
  occurredAt: string;
}

export interface ProviderMatchSnapshot extends ProviderFixture {
  minute: number | null;
  period: MatchPeriod;
  score: Score;
  events: ProviderMatchEvent[];
  occurredAt: string;
  raw?: unknown;
}

export interface LiveDataProvider {
  name: string;
  getFixtures(): Promise<ProviderFixture[]>;
  getLiveMatches(): Promise<ProviderMatchSnapshot[]>;
  getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot>;
  getMatchEvents(externalMatchId: string): Promise<ProviderMatchEvent[]>;
}

export interface WebhookPayload {
  source: string;
  type: "match_snapshot" | "match_event";
  externalMatchId: string;
  matchId?: string;
  status: MatchStatus;
  minute: number | null;
  period: MatchPeriod;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  score: Score;
  events: ProviderMatchEvent[];
  occurredAt: string;
  receivedAt: string;
}

export interface SentUpdateRecord {
  idempotencyKey: string;
  externalMatchId: string;
  updateType: WebhookPayload["type"];
  payloadHash: string;
  sentAt: string;
}

export interface SyncRunRecord {
  id: number;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  errorMessage?: string;
}
