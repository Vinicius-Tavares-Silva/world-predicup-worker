import { describe, expect, it } from "vitest";
import { eventIdempotencyKey, snapshotIdempotencyKey } from "./idempotency.js";
import type { WebhookPayload } from "./types.js";

const payload: WebhookPayload = {
  source: "mock",
  type: "match_snapshot",
  externalMatchId: "provider-match-123",
  matchId: "world-predicup-match-123",
  status: "live",
  minute: 67,
  period: "second_half",
  homeTeam: { id: "BRA", name: "Brazil" },
  awayTeam: { id: "ARG", name: "Argentina" },
  score: { home: 2, away: 1 },
  events: [],
  occurredAt: "2026-06-15T19:25:00.000Z",
  receivedAt: "2026-06-15T19:25:04.000Z",
};

describe("idempotency", () => {
  it("builds stable snapshot keys from source, match, minute, score, and status", () => {
    expect(snapshotIdempotencyKey(payload)).toBe("snapshot:mock:provider-match-123:67:2:1:live");
  });

  it("includes penalty scores and winner team when present", () => {
    expect(snapshotIdempotencyKey({
      ...payload,
      status: "finished",
      minute: null,
      score: { home: 1, away: 1 },
      penaltyScore: { home: 4, away: 3 },
      winnerTeam: { id: "BRA", name: "Brazil" },
    })).toBe("snapshot:mock:provider-match-123:unknown:1:1:finished:pen:4:3:winner:BRA");
  });

  it("builds stable event keys from provider event IDs", () => {
    expect(eventIdempotencyKey("mock", "provider-match-123", {
      externalEventId: "provider-event-999",
      type: "goal",
      minute: 66,
      occurredAt: "2026-06-15T19:24:00.000Z",
    })).toBe("event:mock:provider-match-123:provider-event-999");
  });
});
