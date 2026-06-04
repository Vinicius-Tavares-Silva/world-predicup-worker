import { afterEach, describe, expect, it } from "vitest";
import { MockLiveDataProvider } from "./mock.js";

const overrideKeys = [
  "MOCK_MATCH_EXTERNAL_ID",
  "MOCK_MATCH_ID",
  "MOCK_HOME_TEAM_ID",
  "MOCK_HOME_TEAM_NAME",
  "MOCK_AWAY_TEAM_ID",
  "MOCK_AWAY_TEAM_NAME",
  "MOCK_KICKOFF_AT",
  "MOCK_MATCH_MINUTE",
];

describe("MockLiveDataProvider", () => {
  afterEach(() => {
    for (const key of overrideKeys) {
      delete process.env[key];
    }
  });

  it("uses env overrides for local integration tests", async () => {
    process.env.MOCK_MATCH_EXTERNAL_ID = "mock-local-match";
    process.env.MOCK_MATCH_ID = "app-match-id";
    process.env.MOCK_HOME_TEAM_ID = "home-team-id";
    process.env.MOCK_HOME_TEAM_NAME = "Home Team";
    process.env.MOCK_AWAY_TEAM_ID = "away-team-id";
    process.env.MOCK_AWAY_TEAM_NAME = "Away Team";
    process.env.MOCK_KICKOFF_AT = "2026-06-11T20:00:00.000Z";
    process.env.MOCK_MATCH_MINUTE = "67";

    const [snapshot] = await new MockLiveDataProvider().getLiveMatches();

    expect(snapshot).toMatchObject({
      externalMatchId: "mock-local-match",
      matchId: "app-match-id",
      homeTeam: { id: "home-team-id", name: "Home Team" },
      awayTeam: { id: "away-team-id", name: "Away Team" },
      kickoffAt: "2026-06-11T20:00:00.000Z",
      score: { home: 2, away: 1 },
    });
  });
});
