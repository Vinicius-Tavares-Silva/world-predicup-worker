import type { ProviderMatchSnapshot, WebhookPayload } from "./types.js";

export function normalizeSnapshot(source: string, snapshot: ProviderMatchSnapshot, receivedAt = new Date()): WebhookPayload {
  return {
    source,
    type: "match_snapshot",
    externalMatchId: snapshot.externalMatchId,
    matchId: snapshot.matchId,
    status: snapshot.status,
    minute: snapshot.minute,
    period: snapshot.period,
    homeTeam: snapshot.homeTeam,
    awayTeam: snapshot.awayTeam,
    score: snapshot.score,
    penaltyScore: snapshot.penaltyScore,
    winnerTeam: snapshot.winnerTeam,
    events: snapshot.events,
    occurredAt: snapshot.occurredAt,
    receivedAt: receivedAt.toISOString(),
  };
}
