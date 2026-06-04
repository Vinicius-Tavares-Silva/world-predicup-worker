import { describe, expect, it } from "vitest";
import { indexWorldPredicupMatches, matchKey, normalizeInstant, teamKey } from "./sync-wc2026-mappings.js";

describe("sync-wc2026-mappings helpers", () => {
  it("normalizes WC2026 English team names to World Predicup team keys", () => {
    expect(teamKey("Mexico")).toBe(teamKey("México"));
    expect(teamKey("South Africa")).toBe(teamKey("África do Sul"));
    expect(teamKey("South Korea")).toBe(teamKey("Coreia do Sul"));
    expect(teamKey("Czechia")).toBe(teamKey("Tchéquia"));
    expect(teamKey("DR Congo")).toBe(teamKey("RD Congo"));
  });

  it("indexes app matches by kickoff and normalized teams", () => {
    const [match] = indexWorldPredicupMatches([
      {
        id: "match-1",
        match_date: "2026-06-11T20:00:00+00:00",
        home_team: { name: "México" },
        away_team: { name: "África do Sul" },
      },
    ]).get(matchKey(
      normalizeInstant("2026-06-11T20:00:00.000Z"),
      teamKey("Mexico"),
      teamKey("South Africa"),
    )) ?? [];

    expect(match?.id).toBe("match-1");
  });
});
