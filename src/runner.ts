import { eventIdempotencyKey, payloadHash, snapshotIdempotencyKey } from "./idempotency.js";
import { decideMatchPolling, type MatchPollingDecision, type MatchScheduleEntry } from "./match-schedule.js";
import { normalizeSnapshot } from "./normalizer.js";
import type { LiveDataProvider, ProviderMatchEvent, ProviderMatchSnapshot, WebhookPayload } from "./types.js";
import type { StateStore } from "./state/state-store.js";
import { WebhookClient } from "./webhook-client.js";

export interface WorkerLogger {
  info(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
}

export interface RunWorkerOnceOptions {
  provider: LiveDataProvider;
  stateStore: StateStore;
  webhookClient: WebhookClient;
  now?: Date;
  schedule?: MatchScheduleEntry[];
  logger?: WorkerLogger;
}

export type RunWorkerOnceResult =
  | {
      status: "skipped";
      decision: Extract<MatchPollingDecision, { shouldPoll: false }>;
      ranAt: string;
    }
  | {
      status: "polled";
      decision: Extract<MatchPollingDecision, { shouldPoll: true }>;
      liveMatchCount: number;
      ranAt: string;
    };

export async function runWorkerOnce(options: RunWorkerOnceOptions): Promise<RunWorkerOnceResult> {
  const logger = options.logger ?? consoleWorkerLogger;
  const syncRun = options.stateStore.createSyncRun();

  try {
    const now = options.now ?? new Date();
    logger.info("Worker run started", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      now: now.toISOString(),
    });

    const decision = decideMatchPolling(now, { schedule: options.schedule });
    logger.info("Match polling window decision", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      decision: decision.reason,
      shouldPoll: decision.shouldPoll,
      activeWindow: decision.shouldPoll ? decision.activeWindow : undefined,
      nextWindow: decision.shouldPoll ? undefined : decision.nextWindow,
    });

    if (!decision.shouldPoll) {
      logger.info("No live match window; provider request skipped", {
        provider: options.provider.name,
        syncRunId: syncRun.id,
        now: now.toISOString(),
      });
      options.stateStore.finishSyncRun(syncRun.id, "success");
      return {
        status: "skipped",
        decision,
        ranAt: now.toISOString(),
      };
    }

    logger.info("Fetching live matches from provider", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      activeWindow: decision.activeWindow,
    });
    const shouldReconcileCompleted = shouldReconcileCompletedMatches(decision.activeWindow, now);
    const [liveMatches, completedMatches] = await Promise.all([
      options.provider.getLiveMatches(),
      shouldReconcileCompleted
        ? options.provider.getRecentlyCompletedMatches(decision.activeWindow)
        : Promise.resolve([]),
    ]);
    const snapshots = mergeSnapshots(liveMatches, completedMatches);
    logger.info("Provider live match fetch completed", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      liveMatchCount: liveMatches.length,
      completedMatchCount: completedMatches.length,
      completedReconciliation: shouldReconcileCompleted ? "enabled" : "skipped",
      mergedMatchCount: snapshots.length,
    });

    if (snapshots.length === 0) {
      logger.info("No live or completed matches returned by provider", {
        provider: options.provider.name,
        syncRunId: syncRun.id,
      });
    }

    for (const snapshot of snapshots) {
      logger.info("Processing live match snapshot", {
        provider: options.provider.name,
        syncRunId: syncRun.id,
        externalMatchId: snapshot.externalMatchId,
        matchId: snapshot.matchId,
        status: snapshot.status,
        period: snapshot.period,
        minute: snapshot.minute,
        score: snapshot.score,
        eventCount: snapshot.events.length,
      });
      options.stateStore.upsertMatch(snapshot, options.provider.name);

      const payload = normalizeSnapshot(options.provider.name, snapshot);
      await deliverPayload(options, logger, payload, snapshotIdempotencyKey(payload));

      for (const event of snapshot.events) {
        await deliverPayload(
          options,
          logger,
          eventPayload(payload, event),
          eventIdempotencyKey(options.provider.name, snapshot.externalMatchId, event),
        );
      }
    }

    options.stateStore.finishSyncRun(syncRun.id, "success");
    logger.info("Worker run completed", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      status: "polled",
      liveMatchCount: snapshots.length,
    });
    return {
      status: "polled",
      decision,
      liveMatchCount: snapshots.length,
      ranAt: now.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Worker run failed", {
      provider: options.provider.name,
      syncRunId: syncRun.id,
      error: message,
    });
    options.stateStore.finishSyncRun(syncRun.id, "failed", message);
    throw error;
  }
}

function mergeSnapshots(
  liveMatches: ProviderMatchSnapshot[],
  completedMatches: ProviderMatchSnapshot[],
): ProviderMatchSnapshot[] {
  const snapshots = new Map<string, ProviderMatchSnapshot>();

  for (const snapshot of liveMatches) {
    snapshots.set(snapshot.externalMatchId, snapshot);
  }

  for (const snapshot of completedMatches) {
    snapshots.set(snapshot.externalMatchId, snapshot);
  }

  return [...snapshots.values()];
}

const completedReconciliationWindowMs = 15 * 60_000;

function shouldReconcileCompletedMatches(
  window: { endsAt: string },
  now: Date,
): boolean {
  return now.getTime() >= new Date(window.endsAt).getTime() - completedReconciliationWindowMs;
}

async function deliverPayload(
  options: RunWorkerOnceOptions,
  logger: WorkerLogger,
  payload: WebhookPayload,
  idempotencyKey: string,
): Promise<void> {
  if (options.stateStore.hasSentUpdate(idempotencyKey)) {
    logger.info("Skipping already-sent webhook update", {
      provider: options.provider.name,
      externalMatchId: payload.externalMatchId,
      updateType: payload.type,
      idempotencyKey,
    });
    return;
  }

  logger.info("Sending webhook update", {
    provider: options.provider.name,
    externalMatchId: payload.externalMatchId,
    updateType: payload.type,
    status: payload.status,
    minute: payload.minute,
    score: payload.score,
    idempotencyKey,
  });
  await options.webhookClient.send(payload, idempotencyKey);
  logger.info("Webhook update delivered", {
    provider: options.provider.name,
    externalMatchId: payload.externalMatchId,
    updateType: payload.type,
    idempotencyKey,
  });

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

const consoleWorkerLogger: WorkerLogger = {
  info(message, properties) {
    console.log(message, properties ?? {});
  },
  error(message, properties) {
    console.error(message, properties ?? {});
  },
};
