import type { LiveDataProvider, ProviderFixture, ProviderMatchEvent, ProviderMatchSnapshot } from "../types.js";

const fixture: ProviderFixture = {
  externalMatchId: "mock-bra-arg-2026-06-15",
  matchId: "world-predicup-match-123",
  homeTeam: {
    id: "BRA",
    name: "Brazil",
  },
  awayTeam: {
    id: "ARG",
    name: "Argentina",
  },
  kickoffAt: "2026-06-15T18:00:00.000Z",
  status: "live",
};

export class MockLiveDataProvider implements LiveDataProvider {
  readonly name = "mock";

  async getFixtures(): Promise<ProviderFixture[]> {
    return [fixture];
  }

  async getLiveMatches(): Promise<ProviderMatchSnapshot[]> {
    return [this.buildSnapshot()];
  }

  async getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot> {
    if (externalMatchId !== fixture.externalMatchId) {
      throw new Error(`Mock fixture not found: ${externalMatchId}`);
    }

    return this.buildSnapshot();
  }

  async getMatchEvents(externalMatchId: string): Promise<ProviderMatchEvent[]> {
    return (await this.getMatchSnapshot(externalMatchId)).events;
  }

  private buildSnapshot(now = new Date()): ProviderMatchSnapshot {
    const simulatedMinute = Number(process.env.MOCK_MATCH_MINUTE ?? "67");
    const homeScore = simulatedMinute >= 66 ? 2 : 1;
    const awayScore = 1;
    const occurredAt = now.toISOString();

    const events: ProviderMatchEvent[] = simulatedMinute >= 66
      ? [
          {
            externalEventId: "mock-goal-bra-66",
            type: "goal",
            minute: 66,
            teamId: "BRA",
            playerName: "Example Player",
            scoreAfterEvent: {
              home: 2,
              away: 1,
            },
            occurredAt,
          },
        ]
      : [];

    return {
      ...fixture,
      minute: simulatedMinute,
      period: simulatedMinute <= 45 ? "first_half" : "second_half",
      score: {
        home: homeScore,
        away: awayScore,
      },
      events,
      occurredAt,
      raw: {
        provider: "mock",
        generatedAt: occurredAt,
      },
    };
  }
}
