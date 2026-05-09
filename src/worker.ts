import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env-file.js";
import { createProvider } from "./provider.js";
import { runWorkerOnce } from "./runner.js";
import { SqliteStateStore } from "./state/sqlite-state-store.js";
import { WebhookClient } from "./webhook-client.js";

export async function runConfiguredWorkerOnce(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();
  const provider = createProvider(config);
  const stateStore = new SqliteStateStore(config.stateDbPath);
  const webhookClient = new WebhookClient(config);

  try {
    await runWorkerOnce({
      provider,
      stateStore,
      webhookClient,
    });
  } finally {
    stateStore.close();
  }
}
