import { describe, expect, it, vi } from "vitest";
import { runWorkerOnce } from "./runner.js";
import { MemoryStateStore } from "./state/memory-state-store.js";
import type { LiveDataProvider, ProviderMatchSnapshot } from "./types.js";
import type { WebhookClient } from "./webhook-client.js";

describe("runWorkerOnce scheduling gate", () => {
  it("does not call the provider when no match window is active", async () => {
    const getLiveMatches = vi.fn(async () => []);
    const logger = fakeLogger();

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches),
      stateStore: new MemoryStateStore(),
      webhookClient: fakeWebhookClient(),
      now: new Date("2026-06-04T18:00:00.000Z"),
      logger,
    });

    expect(result).toMatchObject({
      status: "skipped",
      decision: {
        shouldPoll: false,
        reason: "no_live_match",
      },
    });
    expect(getLiveMatches).not.toHaveBeenCalled();
    expect(logger.info.mock.calls.map(([message]) => message)).toEqual([
      "Worker run started",
      "Match polling window decision",
      "No live match window; provider request skipped",
    ]);
  });

  it("calls live provider only when a match window is active but not near the end", async () => {
    const getLiveMatches = vi.fn(async () => []);
    const getRecentlyCompletedMatches = vi.fn(async () => []);

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches, getRecentlyCompletedMatches),
      stateStore: new MemoryStateStore(),
      webhookClient: fakeWebhookClient(),
      now: new Date("2026-06-11T19:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "polled",
      liveMatchCount: 0,
      decision: {
        shouldPoll: true,
        reason: "inside_match_window",
      },
    });
    expect(getLiveMatches).toHaveBeenCalledOnce();
    expect(getRecentlyCompletedMatches).not.toHaveBeenCalled();
  });

  it("sends one snapshot webhook per live match returned by the provider", async () => {
    const getLiveMatches = vi.fn(async () => [
      fakeSnapshot("match-1", "BRA", "ARG"),
      fakeSnapshot("match-2", "MEX", "RSA"),
    ]);
    const webhookClient = fakeWebhookClient();

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches),
      stateStore: new MemoryStateStore(),
      webhookClient,
      now: new Date("2026-06-11T19:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "polled",
      liveMatchCount: 2,
    });
    expect(webhookClient.send).toHaveBeenCalledTimes(2);
    expect(webhookClient.send.mock.calls.map(([payload]) => payload.externalMatchId)).toEqual(["match-1", "match-2"]);
  });

  it("skips completed reconciliation until the trailing part of a match window", async () => {
    const getLiveMatches = vi.fn(async () => []);
    const getRecentlyCompletedMatches = vi.fn(async () => []);

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches, getRecentlyCompletedMatches),
      stateStore: new MemoryStateStore(),
      webhookClient: fakeWebhookClient(),
      now: new Date("2026-06-28T18:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "polled",
      liveMatchCount: 0,
    });
    expect(getLiveMatches).toHaveBeenCalledOnce();
    expect(getRecentlyCompletedMatches).not.toHaveBeenCalled();
  });

  it("reconciles completed matches near the end of a knockout window", async () => {
    const getLiveMatches = vi.fn(async () => []);
    const completedSnapshot = {
      ...fakeSnapshot("match-1", "BRA", "ARG"),
      status: "finished" as const,
      period: "full_time" as const,
      minute: null,
    };
    const getRecentlyCompletedMatches = vi.fn(async () => [completedSnapshot]);
    const webhookClient = fakeWebhookClient();

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches, getRecentlyCompletedMatches),
      stateStore: new MemoryStateStore(),
      webhookClient,
      now: new Date("2026-06-28T21:20:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "polled",
      liveMatchCount: 1,
    });
    expect(getLiveMatches).toHaveBeenCalledOnce();
    expect(getRecentlyCompletedMatches).toHaveBeenCalledOnce();
    expect(webhookClient.send).toHaveBeenCalledTimes(1);
    expect(webhookClient.send.mock.calls[0][0]).toMatchObject({
      externalMatchId: "match-1",
      status: "finished",
    });
  });

  it("reconciles completed group-stage matches on the trailing window poll", async () => {
    const getLiveMatches = vi.fn(async () => []);
    const completedSnapshot = {
      ...fakeSnapshot("match-1", "BRA", "ARG"),
      status: "finished" as const,
      period: "full_time" as const,
      minute: null,
    };
    const getRecentlyCompletedMatches = vi.fn(async () => [completedSnapshot]);
    const webhookClient = fakeWebhookClient();

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches, getRecentlyCompletedMatches),
      stateStore: new MemoryStateStore(),
      webhookClient,
      now: new Date("2026-06-11T21:10:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "polled",
      liveMatchCount: 1,
    });
    expect(getLiveMatches).toHaveBeenCalledOnce();
    expect(getRecentlyCompletedMatches).toHaveBeenCalledOnce();
    expect(webhookClient.send).toHaveBeenCalledTimes(1);
    expect(webhookClient.send.mock.calls[0][0]).toMatchObject({
      externalMatchId: "match-1",
      status: "finished",
      period: "full_time",
    });
  });

  it("prefers completed reconciliation snapshots over live snapshots for the same match", async () => {
    const liveSnapshot = fakeSnapshot("match-1", "BRA", "ARG");
    const completedSnapshot = {
      ...liveSnapshot,
      status: "finished" as const,
      period: "full_time" as const,
      score: { home: 3, away: 1 },
      minute: null,
    };
    const webhookClient = fakeWebhookClient();

    await runWorkerOnce({
      provider: fakeProvider(
        vi.fn(async () => [liveSnapshot]),
        vi.fn(async () => [completedSnapshot]),
      ),
      stateStore: new MemoryStateStore(),
      webhookClient,
      now: new Date("2026-06-28T21:20:00.000Z"),
    });

    expect(webhookClient.send).toHaveBeenCalledTimes(1);
    expect(webhookClient.send.mock.calls[0][0]).toMatchObject({
      externalMatchId: "match-1",
      status: "finished",
      score: { home: 3, away: 1 },
    });
  });
});

function fakeProvider(
  getLiveMatches: LiveDataProvider["getLiveMatches"],
  getRecentlyCompletedMatches: LiveDataProvider["getRecentlyCompletedMatches"] = vi.fn(async () => []),
): LiveDataProvider {
  return {
    name: "fake",
    getFixtures: async () => [],
    getAllMatches: async () => [],
    getLiveMatches,
    getRecentlyCompletedMatches,
    getMatchSnapshot: async () => {
      throw new Error("not implemented");
    },
    getMatchEvents: async () => [],
  };
}

function fakeWebhookClient(): WebhookClient & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(),
  } as unknown as WebhookClient & { send: ReturnType<typeof vi.fn> };
}

function fakeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function fakeSnapshot(externalMatchId: string, homeTeamId: string, awayTeamId: string): ProviderMatchSnapshot {
  return {
    externalMatchId,
    matchId: externalMatchId,
    homeTeam: { id: homeTeamId, name: homeTeamId },
    awayTeam: { id: awayTeamId, name: awayTeamId },
    kickoffAt: "2026-06-11T19:00:00.000Z",
    status: "live",
    minute: 67,
    period: "second_half",
    score: { home: 2, away: 1 },
    events: [],
    occurredAt: "2026-06-11T20:10:00.000Z",
  };
}
