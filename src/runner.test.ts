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

  it("calls the provider when a match window is active", async () => {
    const getLiveMatches = vi.fn(async () => []);

    const result = await runWorkerOnce({
      provider: fakeProvider(getLiveMatches),
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
});

function fakeProvider(getLiveMatches: LiveDataProvider["getLiveMatches"]): LiveDataProvider {
  return {
    name: "fake",
    getFixtures: async () => [],
    getLiveMatches,
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
