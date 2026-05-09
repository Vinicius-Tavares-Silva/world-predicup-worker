import { logger, schedules } from "@trigger.dev/sdk/v3";
import { loadConfig } from "../config.js";
import { createProvider } from "../provider.js";
import { runWorkerOnce } from "../runner.js";
import { MemoryStateStore } from "../state/memory-state-store.js";
import { WebhookClient } from "../webhook-client.js";

export const pollLiveWorldCupMatches = schedules.task({
  id: "poll-live-world-cup-matches",
  maxDuration: 120,
  run: async (payload) => {
    logger.log("Polling World Predicup live match provider", {
      timestamp: payload.timestamp,
      lastTimestamp: payload.lastTimestamp,
    });

    const config = loadConfig();
    await runWorkerOnce({
      provider: createProvider(config),
      stateStore: new MemoryStateStore(),
      webhookClient: new WebhookClient(config),
    });

    return {
      ok: true,
      ranAt: new Date().toISOString(),
    };
  },
});
