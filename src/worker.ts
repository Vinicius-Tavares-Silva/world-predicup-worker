import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";
import { createProvider } from "./provider.js";
import { runWorkerOnce } from "./runner.js";
import { SqliteStateStore } from "./state/sqlite-state-store.js";
import { WebhookClient } from "./webhook-client.js";
import { loadWc2026ScheduleArtifact } from "./wc2026-schedule-artifact.js";

export async function runConfiguredWorkerOnce(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();
  const provider = createProvider(config);
  const stateStore = new SqliteStateStore(config.stateDbPath);
  const webhookClient = new WebhookClient(config);
  const schedule = config.wc2026SchedulePath
    ? loadWc2026ScheduleArtifact(config.wc2026SchedulePath)
    : undefined;

  try {
    await runWorkerOnce({
      provider,
      stateStore,
      webhookClient,
      schedule,
    });
  } finally {
    stateStore.close();
  }
}
