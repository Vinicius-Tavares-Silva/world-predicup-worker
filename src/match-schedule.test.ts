import { describe, expect, it } from "vitest";
import { buildMatchPollingWindows, decideMatchPolling } from "./match-schedule.js";

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

  it("uses a 150-minute post-kickoff window for group-stage matches", () => {
    const window = buildMatchPollingWindows(30 * 60_000, 150 * 60_000, 210 * 60_000)
      .find((item) => item.kickoffAt === "2026-06-11T19:00:00Z");

    expect(window).toMatchObject({
      stage: "group_stage",
      startsAt: "2026-06-11T18:30:00.000Z",
      endsAt: "2026-06-11T21:30:00.000Z",
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
});
