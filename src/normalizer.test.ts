import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "./normalizer.js";
import type { ProviderMatchSnapshot } from "./types.js";

describe("normalizeSnapshot", () => {
  it("maps provider snapshots into the webhook contract", () => {
    const snapshot: ProviderMatchSnapshot = {
      externalMatchId: "provider-match-123",
      matchId: "world-predicup-match-123",
      status: "live",
      minute: 67,
      period: "second_half",
      homeTeam: { id: "BRA", name: "Brazil" },
      awayTeam: { id: "ARG", name: "Argentina" },
      kickoffAt: "2026-06-15T18:00:00.000Z",
      score: { home: 2, away: 1 },
      events: [],
      occurredAt: "2026-06-15T19:25:00.000Z",
    };

    expect(normalizeSnapshot("mock", snapshot, new Date("2026-06-15T19:25:04.000Z"))).toEqual({
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
    });
  });
});
