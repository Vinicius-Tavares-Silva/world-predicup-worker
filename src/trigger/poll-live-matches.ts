import { logger, schedules } from "@trigger.dev/sdk/v3";
import { loadConfig } from "../config.js";
import { createProvider } from "../provider.js";
import { runWorkerOnce } from "../runner.js";
import { MemoryStateStore } from "../state/memory-state-store.js";
import { WebhookClient } from "../webhook-client.js";
import { loadWc2026ScheduleArtifact } from "../wc2026-schedule-artifact.js";

const triggerLogger = {
  info(message: string, properties?: Record<string, unknown>): void {
    logger.info(message, properties);
  },
  error(message: string, properties?: Record<string, unknown>): void {
    logger.error(message, properties);
  },
};

export const pollLiveWorldCupMatches = schedules.task({
  id: "poll-live-world-cup-matches",
  maxDuration: 120,
  run: async (payload) => {
    logger.log("Polling World Predicup live match provider", {
      timestamp: payload.timestamp,
      lastTimestamp: payload.lastTimestamp,
    });

    const config = loadConfig();
    const schedule = config.wc2026SchedulePath
      ? loadWc2026ScheduleArtifact(config.wc2026SchedulePath)
      : undefined;
    const result = await runWorkerOnce({
      provider: createProvider(config),
      stateStore: new MemoryStateStore(),
      webhookClient: new WebhookClient(config),
      now: payload.timestamp,
      schedule,
      logger: triggerLogger,
    });

    logger.log("World Predicup live match polling decision", result);

    if (result.status === "skipped") {
      return {
        ok: true,
        status: "skipped",
        reason: result.decision.reason,
        nextWindow: result.decision.nextWindow,
        ranAt: result.ranAt,
      };
    }

    return {
      ok: true,
      status: "polled",
      liveMatchCount: result.liveMatchCount,
      activeWindow: result.decision.activeWindow,
      ranAt: result.ranAt,
    };
  },
});
