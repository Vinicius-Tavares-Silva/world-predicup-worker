import { describe, expect, it } from "vitest";
import { ApiFootballProvider } from "./api-football.js";
import { loadConfig } from "../config.js";

describe("ApiFootballProvider", () => {
  it("maps API-Football live fixture responses to provider snapshots", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(JSON.stringify({
      get: "fixtures",
      parameters: { live: "1" },
      errors: [],
      results: 1,
      paging: { current: 1, total: 1 },
      response: [
        {
          fixture: {
            id: 123,
            date: "2026-06-15T18:00:00+00:00",
            status: { long: "Second Half", short: "2H", elapsed: 67, extra: null },
          },
          league: { id: 1, name: "World Cup", season: 2026 },
          teams: {
            home: { id: 6, name: "Brazil", winner: true },
            away: { id: 26, name: "Argentina", winner: false },
          },
          goals: { home: 2, away: 1 },
          events: [
            {
              time: { elapsed: 66, extra: null },
              team: { id: 6, name: "Brazil" },
              player: { id: 10, name: "Example Player" },
              assist: { id: null, name: null },
              type: "Goal",
              detail: "Normal Goal",
              comments: null,
            },
          ],
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    try {
      const provider = new ApiFootballProvider(loadConfig({
        SPORTS_DATA_PROVIDER: "api-football",
        SPORTS_DATA_API_KEY: "test-key",
      }));

      const [snapshot] = await provider.getLiveMatches();

      expect(snapshot).toMatchObject({
        externalMatchId: "123",
        status: "live",
        minute: 67,
        period: "second_half",
        homeTeam: { id: "6", name: "Brazil" },
        awayTeam: { id: "26", name: "Argentina" },
        score: { home: 2, away: 1 },
        events: [
          {
            type: "goal",
            minute: 66,
            teamId: "6",
            playerName: "Example Player",
            scoreAfterEvent: { home: 2, away: 1 },
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
