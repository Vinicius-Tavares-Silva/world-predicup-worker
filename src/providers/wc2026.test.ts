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
      home_team_id: 1,
      away_team_code: "ARG",
      away_team_id: 2,
      kickoff_utc: "2026-06-15T18:00:00.000Z",
      status: "live",
      phase: "2H",
      match_minute: 67,
      home_score: 2,
      away_score: 1,
      home_pen: null,
      away_pen: null,
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

  it("maps WC2026 /matches rows to fixtures with provider team codes and stage", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(JSON.stringify(groupASample), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    try {
      const provider = new Wc2026Provider(loadConfig({
        SPORTS_DATA_PROVIDER: "wc2026",
        SPORTS_DATA_API_KEY: "test-key",
      }));

      const fixtures = await provider.getFixtures();

      expect(fixtures).toHaveLength(4);
      expect(fixtures[0]).toMatchObject({
        externalMatchId: "1",
        matchId: "1",
        status: "scheduled",
        stage: "group_stage",
        kickoffAt: "2026-06-11T20:00:00.000Z",
        homeTeam: { id: "MEX", name: "Mexico" },
        awayTeam: { id: "RSA", name: "South Africa" },
      });
      expect(fixtures.filter((fixture) => fixture.kickoffAt === "2026-06-25T01:00:00.000Z")).toHaveLength(2);
      expect(fixtures[2]).toMatchObject({
        homeTeam: { id: "KOR", name: "Korea Republic" },
        awayTeam: { id: "CZE", name: "Czechia" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps completed penalty shootout scores and winner team", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response(JSON.stringify([
      {
        id: 101,
        match_number: 101,
        round: "round_of_32",
        group_name: null,
        home_team_id: 1,
        home_team: "Brazil",
        home_team_code: "BRA",
        away_team_id: 2,
        away_team: "Argentina",
        away_team_code: "ARG",
        kickoff_utc: "2026-06-28T18:00:00.000Z",
        home_score: 1,
        away_score: 1,
        home_pen: 4,
        away_pen: 3,
        status: "completed",
        phase: "FT_PEN",
      },
    ]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    try {
      const provider = new Wc2026Provider(loadConfig({
        SPORTS_DATA_PROVIDER: "wc2026",
        SPORTS_DATA_API_KEY: "test-key",
      }));

      const [snapshot] = await provider.getAllMatches();

      expect(snapshot).toMatchObject({
        externalMatchId: "101",
        status: "finished",
        period: "penalties",
        stage: "knockout",
        score: { home: 1, away: 1 },
        penaltyScore: { home: 4, away: 3 },
        winnerTeam: { id: "BRA", name: "Brazil" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

const groupASample = [
  {
    id: 1,
    match_number: 1,
    round: "group",
    group_name: "A",
    home_team_id: 1,
    home_team: "Mexico",
    home_team_code: "MEX",
    away_team_id: 2,
    away_team: "South Africa",
    away_team_code: "RSA",
    kickoff_utc: "2026-06-11T20:00:00.000Z",
    home_score: null,
    away_score: null,
    home_pen: null,
    away_pen: null,
    status: "scheduled",
    phase: "PRE",
  },
  {
    id: 2,
    match_number: 2,
    round: "group",
    group_name: "A",
    home_team_id: 3,
    home_team: "Korea Republic",
    home_team_code: "KOR",
    away_team_id: 4,
    away_team: "Czechia",
    away_team_code: "CZE",
    kickoff_utc: "2026-06-12T20:00:00.000Z",
    home_score: null,
    away_score: null,
    home_pen: null,
    away_pen: null,
    status: "scheduled",
    phase: "PRE",
  },
  {
    id: 35,
    match_number: 35,
    round: "group",
    group_name: "A",
    home_team_id: 3,
    home_team: "Korea Republic",
    home_team_code: "KOR",
    away_team_id: 4,
    away_team: "Czechia",
    away_team_code: "CZE",
    kickoff_utc: "2026-06-25T01:00:00.000Z",
    home_score: null,
    away_score: null,
    home_pen: null,
    away_pen: null,
    status: "scheduled",
    phase: "PRE",
  },
  {
    id: 36,
    match_number: 36,
    round: "group",
    group_name: "A",
    home_team_id: 1,
    home_team: "Mexico",
    home_team_code: "MEX",
    away_team_id: 2,
    away_team: "South Africa",
    away_team_code: "RSA",
    kickoff_utc: "2026-06-25T01:00:00.000Z",
    home_score: null,
    away_score: null,
    home_pen: null,
    away_pen: null,
    status: "scheduled",
    phase: "PRE",
  },
];
