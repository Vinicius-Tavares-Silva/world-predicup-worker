import type { LiveDataProvider, ProviderFixture, ProviderMatchEvent, ProviderMatchSnapshot } from "../types.js";

export class MockLiveDataProvider implements LiveDataProvider {
  readonly name = "mock";

  async getFixtures(): Promise<ProviderFixture[]> {
    return [mockFixture()];
  }

  async getLiveMatches(): Promise<ProviderMatchSnapshot[]> {
    return [this.buildSnapshot()];
  }

  async getAllMatches(): Promise<ProviderMatchSnapshot[]> {
    return [this.buildSnapshot()];
  }

  async getRecentlyCompletedMatches(): Promise<ProviderMatchSnapshot[]> {
    const snapshot = this.buildSnapshot();
    return snapshot.status === "finished" ? [snapshot] : [];
  }

  async getMatchSnapshot(externalMatchId: string): Promise<ProviderMatchSnapshot> {
    const fixture = mockFixture();
    if (externalMatchId !== fixture.externalMatchId) {
      throw new Error(`Mock fixture not found: ${externalMatchId}`);
    }

    return this.buildSnapshot();
  }

  async getMatchEvents(externalMatchId: string): Promise<ProviderMatchEvent[]> {
    return (await this.getMatchSnapshot(externalMatchId)).events;
  }

  private buildSnapshot(now = new Date()): ProviderMatchSnapshot {
    const fixture = mockFixture();
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

function mockFixture(): ProviderFixture {
  return {
    externalMatchId: process.env.MOCK_MATCH_EXTERNAL_ID ?? "mock-bra-arg-2026-06-15",
    matchId: process.env.MOCK_MATCH_ID ?? "world-predicup-match-123",
    homeTeam: {
      id: process.env.MOCK_HOME_TEAM_ID ?? "BRA",
      name: process.env.MOCK_HOME_TEAM_NAME ?? "Brazil",
    },
    awayTeam: {
      id: process.env.MOCK_AWAY_TEAM_ID ?? "ARG",
      name: process.env.MOCK_AWAY_TEAM_NAME ?? "Argentina",
    },
    kickoffAt: process.env.MOCK_KICKOFF_AT ?? "2026-06-15T18:00:00.000Z",
    status: "live",
  };
}
