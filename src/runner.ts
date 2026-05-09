import { eventIdempotencyKey, payloadHash, snapshotIdempotencyKey } from "./idempotency.js";
import { normalizeSnapshot } from "./normalizer.js";
import type { LiveDataProvider, ProviderMatchEvent, WebhookPayload } from "./types.js";
import type { StateStore } from "./state/state-store.js";
import { WebhookClient } from "./webhook-client.js";

export interface RunWorkerOnceOptions {
  provider: LiveDataProvider;
  stateStore: StateStore;
  webhookClient: WebhookClient;
}

export async function runWorkerOnce(options: RunWorkerOnceOptions): Promise<void> {
  const syncRun = options.stateStore.createSyncRun();

  try {
    const liveMatches = await options.provider.getLiveMatches();
    if (liveMatches.length === 0) {
      console.log(`No live matches returned by provider: ${options.provider.name}`);
    }

    for (const snapshot of liveMatches) {
      options.stateStore.upsertMatch(snapshot, options.provider.name);

      const payload = normalizeSnapshot(options.provider.name, snapshot);
      await deliverPayload(options, payload, snapshotIdempotencyKey(payload));

      for (const event of snapshot.events) {
        await deliverPayload(options, eventPayload(payload, event), eventIdempotencyKey(options.provider.name, snapshot.externalMatchId, event));
      }
    }

    options.stateStore.finishSyncRun(syncRun.id, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.stateStore.finishSyncRun(syncRun.id, "failed", message);
    throw error;
  }
}

async function deliverPayload(options: RunWorkerOnceOptions, payload: WebhookPayload, idempotencyKey: string): Promise<void> {
  if (options.stateStore.hasSentUpdate(idempotencyKey)) {
    console.log(`Skipping already-sent update: ${idempotencyKey}`);
    return;
  }

  await options.webhookClient.send(payload, idempotencyKey);
  options.stateStore.recordSentUpdate({
    idempotencyKey,
    externalMatchId: payload.externalMatchId,
    updateType: payload.type,
    sentAt: new Date().toISOString(),
    payloadHash: payloadHash(payload),
  });
}

function eventPayload(snapshotPayload: WebhookPayload, event: ProviderMatchEvent): WebhookPayload {
  return {
    ...snapshotPayload,
    type: "match_event",
    minute: event.minute,
    events: [event],
    occurredAt: event.occurredAt,
  };
}
