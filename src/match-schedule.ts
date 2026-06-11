import type { ProviderFixture } from "./types.js";

export type MatchPollingDecision =
  | {
      shouldPoll: true;
      reason: "inside_match_window";
      activeWindow: MatchPollingWindow;
    }
  | {
      shouldPoll: false;
      reason: "no_live_match";
      nextWindow?: MatchPollingWindow;
    };

export type MatchPollingWindow = {
  kickoffAt: string;
  stage: MatchScheduleStage;
  startsAt: string;
  endsAt: string;
};

export type MatchScheduleStage = "group_stage" | "knockout";

export type MatchScheduleEntry = {
  externalMatchId?: string;
  kickoffAt: string;
  stage: MatchScheduleStage;
};

export type MatchWindowDurations = {
  groupBeforeMs: number;
  knockoutBeforeMs: number;
  groupAfterMs: number;
  knockoutAfterMs: number;
};

const groupStageKickoffs = [
  "2026-06-11T19:00:00Z", "2026-06-12T02:00:00Z", "2026-06-12T19:00:00Z",
  "2026-06-13T01:00:00Z", "2026-06-13T19:00:00Z", "2026-06-13T22:00:00Z",
  "2026-06-14T01:00:00Z", "2026-06-14T04:00:00Z", "2026-06-14T17:00:00Z",
  "2026-06-14T20:00:00Z", "2026-06-14T23:00:00Z", "2026-06-15T02:00:00Z",
  "2026-06-15T16:00:00Z", "2026-06-15T19:00:00Z", "2026-06-15T22:00:00Z",
  "2026-06-16T01:00:00Z", "2026-06-16T19:00:00Z", "2026-06-16T22:00:00Z",
  "2026-06-17T01:00:00Z", "2026-06-17T04:00:00Z", "2026-06-17T17:00:00Z",
  "2026-06-17T20:00:00Z", "2026-06-17T23:00:00Z", "2026-06-18T02:00:00Z",
  "2026-06-18T16:00:00Z", "2026-06-18T19:00:00Z", "2026-06-18T22:00:00Z",
  "2026-06-19T01:00:00Z", "2026-06-19T19:00:00Z", "2026-06-19T22:00:00Z",
  "2026-06-20T01:00:00Z", "2026-06-20T04:00:00Z", "2026-06-20T17:00:00Z",
  "2026-06-20T20:00:00Z", "2026-06-21T00:00:00Z", "2026-06-21T04:00:00Z",
  "2026-06-21T16:00:00Z", "2026-06-21T19:00:00Z", "2026-06-21T22:00:00Z",
  "2026-06-22T01:00:00Z", "2026-06-22T17:00:00Z", "2026-06-22T21:00:00Z",
  "2026-06-23T00:00:00Z", "2026-06-23T03:00:00Z", "2026-06-23T17:00:00Z",
  "2026-06-23T20:00:00Z", "2026-06-23T23:00:00Z", "2026-06-24T02:00:00Z",
  "2026-06-24T19:00:00Z", "2026-06-24T22:00:00Z", "2026-06-25T01:00:00Z",
  "2026-06-25T20:00:00Z", "2026-06-25T23:00:00Z", "2026-06-26T02:00:00Z",
  "2026-06-26T19:00:00Z", "2026-06-27T00:00:00Z", "2026-06-27T03:00:00Z",
  "2026-06-27T21:00:00Z", "2026-06-27T23:30:00Z", "2026-06-28T02:00:00Z",
];

const knockoutKickoffs = [
  "2026-06-28T18:00:00Z", "2026-06-29T16:00:00Z", "2026-06-29T19:30:00Z",
  "2026-06-30T00:00:00Z", "2026-06-30T16:00:00Z", "2026-06-30T20:00:00Z",
  "2026-07-01T00:00:00Z", "2026-07-01T15:00:00Z", "2026-07-01T19:00:00Z",
  "2026-07-01T23:00:00Z", "2026-07-02T18:00:00Z", "2026-07-02T22:00:00Z",
  "2026-07-03T02:00:00Z", "2026-07-03T17:00:00Z", "2026-07-03T21:00:00Z",
  "2026-07-04T00:30:00Z", "2026-07-04T16:00:00Z", "2026-07-04T20:00:00Z",
  "2026-07-05T19:00:00Z", "2026-07-05T23:00:00Z", "2026-07-06T18:00:00Z",
  "2026-07-06T23:00:00Z", "2026-07-07T15:00:00Z", "2026-07-07T19:00:00Z",
  "2026-07-09T19:00:00Z", "2026-07-10T18:00:00Z", "2026-07-11T20:00:00Z",
  "2026-07-12T00:00:00Z", "2026-07-14T18:00:00Z", "2026-07-15T18:00:00Z",
  "2026-07-18T20:00:00Z", "2026-07-19T18:00:00Z",
];

export function decideMatchPolling(
  now = new Date(),
  options: {
    beforeMinutes?: number;
    groupBeforeMinutes?: number;
    knockoutBeforeMinutes?: number;
    groupAfterMinutes?: number;
    knockoutAfterMinutes?: number;
    schedule?: MatchScheduleEntry[];
  } = {},
): MatchPollingDecision {
  const groupBeforeMs = (options.groupBeforeMinutes ?? options.beforeMinutes ?? 10) * 60_000;
  const knockoutBeforeMs = (options.knockoutBeforeMinutes ?? options.beforeMinutes ?? 30) * 60_000;
  const groupAfterMs = (options.groupAfterMinutes ?? 130) * 60_000;
  const knockoutAfterMs = (options.knockoutAfterMinutes ?? 210) * 60_000;
  const nowMs = now.getTime();
  const durations = { groupBeforeMs, knockoutBeforeMs, groupAfterMs, knockoutAfterMs };
  const windows = options.schedule
    ? buildMatchPollingWindowsFromScheduleWithDurations(options.schedule, durations)
    : buildMatchPollingWindowsFromScheduleWithDurations(defaultMatchSchedule, durations);

  const activeWindow = windows.find((window) => {
    const startsAt = new Date(window.startsAt).getTime();
    const endsAt = new Date(window.endsAt).getTime();
    return nowMs >= startsAt && nowMs <= endsAt;
  });

  if (activeWindow) {
    return {
      shouldPoll: true,
      reason: "inside_match_window",
      activeWindow,
    };
  }

  return {
    shouldPoll: false,
    reason: "no_live_match",
    nextWindow: windows.find((window) => new Date(window.startsAt).getTime() > nowMs),
  };
}

export function buildMatchPollingWindows(
  beforeMs: number,
  groupAfterMs: number,
  knockoutAfterMs: number,
): MatchPollingWindow[] {
  return buildMatchPollingWindowsFromSchedule(defaultMatchSchedule, beforeMs, groupAfterMs, knockoutAfterMs);
}

export function buildMatchPollingWindowsWithDurations(
  durations: MatchWindowDurations,
): MatchPollingWindow[] {
  return buildMatchPollingWindowsFromScheduleWithDurations(defaultMatchSchedule, durations);
}

export function buildMatchPollingWindowsFromFixtures(
  fixtures: ProviderFixture[],
  beforeMs: number,
  groupAfterMs: number,
  knockoutAfterMs: number,
): MatchPollingWindow[] {
  return buildMatchPollingWindowsFromSchedule(
    fixtures.map((fixture) => ({
      externalMatchId: fixture.externalMatchId,
      kickoffAt: fixture.kickoffAt,
      stage: fixture.stage ?? "group_stage",
    })),
    beforeMs,
    groupAfterMs,
    knockoutAfterMs,
  );
}

export function buildMatchPollingWindowsFromSchedule(
  schedule: MatchScheduleEntry[],
  beforeMs: number,
  groupAfterMs: number,
  knockoutAfterMs: number,
): MatchPollingWindow[] {
  const windows = schedule.map((entry) => buildWindow(
    entry.kickoffAt,
    entry.stage,
    beforeMs,
    entry.stage === "group_stage" ? groupAfterMs : knockoutAfterMs,
  ));

  return windows.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function buildMatchPollingWindowsFromScheduleWithDurations(
  schedule: MatchScheduleEntry[],
  durations: MatchWindowDurations,
): MatchPollingWindow[] {
  const windows = schedule.map((entry) => buildWindow(
    entry.kickoffAt,
    entry.stage,
    entry.stage === "group_stage" ? durations.groupBeforeMs : durations.knockoutBeforeMs,
    entry.stage === "group_stage" ? durations.groupAfterMs : durations.knockoutAfterMs,
  ));

  return windows.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function buildWindow(
  kickoffAt: string,
  stage: MatchScheduleStage,
  beforeMs: number,
  afterMs: number,
): MatchPollingWindow {
    const kickoffMs = new Date(kickoffAt).getTime();
    return {
      kickoffAt,
      stage,
      startsAt: new Date(kickoffMs - beforeMs).toISOString(),
      endsAt: new Date(kickoffMs + afterMs).toISOString(),
    };
}

const defaultMatchSchedule: MatchScheduleEntry[] = [
  ...groupStageKickoffs.map((kickoffAt) => ({ kickoffAt, stage: "group_stage" as const })),
  ...knockoutKickoffs.map((kickoffAt) => ({ kickoffAt, stage: "knockout" as const })),
];
