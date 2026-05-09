import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { Wc2026Provider } from "./wc2026.js";

describe("Wc2026Provider", () => {
  it("maps the sandbox test match to score and live status snapshots", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(JSON.stringify({
      _sandbox: true,
      id: 9999,
      match_number: 999,
      round: "final",
      group_name: null,
      home_team: "Brazil",
      home_team_code: "BRA",
      away_team: "Argentina",
      away_team_code: "ARG",
      kickoff_utc: "2026-06-15T18:00:00.000Z",
      status: "live",
      phase: "2H",
      match_minute: 67,
      home_score: 2,
      away_score: 1,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    try {
      const provider = new Wc2026Provider(loadConfig({
        SPORTS_DATA_PROVIDER: "wc2026",
        SPORTS_DATA_API_KEY: "test-key",
        WC2026_USE_TEST_ENDPOINT: "true",
      }));

      const [snapshot] = await provider.getLiveMatches();

      expect(snapshot).toMatchObject({
        externalMatchId: "9999",
        matchId: "9999",
        status: "live",
        minute: 67,
        period: "second_half",
        homeTeam: { id: "BRA", name: "Brazil" },
        awayTeam: { id: "ARG", name: "Argentina" },
        score: { home: 2, away: 1 },
        events: [],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
