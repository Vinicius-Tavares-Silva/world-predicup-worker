import { describe, expect, it } from "vitest";
import {
  buildMatchPollingWindows,
  buildMatchPollingWindowsWithDurations,
  buildMatchPollingWindowsFromFixtures,
  decideMatchPolling,
} from "./match-schedule.js";

describe("decideMatchPolling", () => {
  it("skips outside the World Cup match windows", () => {
    const decision = decideMatchPolling(new Date("2026-06-04T18:00:00.000Z"));

    expect(decision).toMatchObject({
      shouldPoll: false,
      reason: "no_live_match",
    });
  });

  it("polls inside a known match window", () => {
    const decision = decideMatchPolling(new Date("2026-06-11T19:00:00.000Z"));

    expect(decision).toMatchObject({
      shouldPoll: true,
      reason: "inside_match_window",
    });
  });

  it("uses shorter group-stage windows by default", () => {
    const decision = decideMatchPolling(new Date("2026-06-11T18:45:00.000Z"));

    expect(decision).toMatchObject({
      shouldPoll: false,
      reason: "no_live_match",
    });

    const activeDecision = decideMatchPolling(new Date("2026-06-11T18:50:00.000Z"));

    expect(activeDecision).toMatchObject({
      shouldPoll: true,
      activeWindow: {
        startsAt: "2026-06-11T18:50:00.000Z",
        endsAt: "2026-06-11T21:00:00.000Z",
      },
    });
  });

  it("uses a configured schedule instead of the fallback schedule when provided", () => {
    const decision = decideMatchPolling(new Date("2026-08-01T12:00:00.000Z"), {
      schedule: [
        {
          externalMatchId: "custom",
          kickoffAt: "2026-08-01T12:00:00.000Z",
          stage: "group_stage",
        },
      ],
    });

    expect(decision).toMatchObject({
      shouldPoll: true,
      reason: "inside_match_window",
    });
  });

  it("uses a 150-minute post-kickoff window for group-stage matches", () => {
    const window = buildMatchPollingWindows(30 * 60_000, 150 * 60_000, 210 * 60_000)
      .find((item) => item.kickoffAt === "2026-06-11T19:00:00Z");

    expect(window).toMatchObject({
      stage: "group_stage",
      startsAt: "2026-06-11T18:30:00.000Z",
      endsAt: "2026-06-11T21:30:00.000Z",
    });
  });

  it("can build the production group-stage duration policy", () => {
    const window = buildMatchPollingWindowsWithDurations({
      groupBeforeMs: 10 * 60_000,
      groupAfterMs: 120 * 60_000,
      knockoutBeforeMs: 30 * 60_000,
      knockoutAfterMs: 210 * 60_000,
    }).find((item) => item.kickoffAt === "2026-06-11T19:00:00Z");

    expect(window).toMatchObject({
      stage: "group_stage",
      startsAt: "2026-06-11T18:50:00.000Z",
      endsAt: "2026-06-11T21:00:00.000Z",
    });
  });

  it("uses a 210-minute post-kickoff window for knockout matches", () => {
    const window = buildMatchPollingWindows(30 * 60_000, 150 * 60_000, 210 * 60_000)
      .find((item) => item.kickoffAt === "2026-06-28T18:00:00Z");

    expect(window).toMatchObject({
      stage: "knockout",
      startsAt: "2026-06-28T17:30:00.000Z",
      endsAt: "2026-06-28T21:30:00.000Z",
    });
  });

  it("builds one schedule window per WC2026 fixture, including simultaneous kickoffs", () => {
    const windows = buildMatchPollingWindowsFromFixtures([
      groupFixture("1", "2026-06-25T01:00:00.000Z", "MEX", "RSA"),
      groupFixture("2", "2026-06-25T01:00:00.000Z", "KOR", "CZE"),
    ], 30 * 60_000, 150 * 60_000, 210 * 60_000);

    expect(windows.filter((window) => window.kickoffAt === "2026-06-25T01:00:00.000Z")).toHaveLength(2);
  });

  it("builds the Mexico vs South Africa group-stage polling window from WC2026 fixtures", () => {
    const [window] = buildMatchPollingWindowsFromFixtures([
      groupFixture("1", "2026-06-11T20:00:00.000Z", "MEX", "RSA"),
    ], 30 * 60_000, 150 * 60_000, 210 * 60_000);

    expect(window).toMatchObject({
      stage: "group_stage",
      kickoffAt: "2026-06-11T20:00:00.000Z",
      startsAt: "2026-06-11T19:30:00.000Z",
      endsAt: "2026-06-11T22:30:00.000Z",
    });
  });

  it("uses knockout duration for non-group WC2026 fixtures", () => {
    const [window] = buildMatchPollingWindowsFromFixtures([
      {
        ...groupFixture("101", "2026-06-28T18:00:00.000Z", "BRA", "ARG"),
        stage: "knockout",
      },
    ], 30 * 60_000, 150 * 60_000, 210 * 60_000);

    expect(window).toMatchObject({
      stage: "knockout",
      startsAt: "2026-06-28T17:30:00.000Z",
      endsAt: "2026-06-28T21:30:00.000Z",
    });
  });
});

function groupFixture(externalMatchId: string, kickoffAt: string, homeCode: string, awayCode: string) {
  return {
    externalMatchId,
    matchId: externalMatchId,
    homeTeam: { id: homeCode, name: homeCode },
    awayTeam: { id: awayCode, name: awayCode },
    kickoffAt,
    status: "scheduled" as const,
    stage: "group_stage" as const,
  };
}
