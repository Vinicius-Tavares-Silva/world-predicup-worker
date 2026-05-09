import type { ProviderMatchSnapshot, SentUpdateRecord, SyncRunRecord } from "../types.js";
import type { StateStore } from "./state-store.js";

export class MemoryStateStore implements StateStore {
  private nextSyncRunId = 1;
  private readonly sentUpdates = new Set<string>();

  createSyncRun(): SyncRunRecord {
    return {
      id: this.nextSyncRunId++,
      startedAt: new Date().toISOString(),
      status: "running",
    };
  }

  finishSyncRun(_id: number, _status: "success" | "failed", _errorMessage?: string): void {
    // Trigger.dev already records task success/failure and logs.
  }

  hasSentUpdate(idempotencyKey: string): boolean {
    return this.sentUpdates.has(idempotencyKey);
  }

  recordSentUpdate(record: SentUpdateRecord): void {
    this.sentUpdates.add(record.idempotencyKey);
  }

  upsertMatch(_snapshot: ProviderMatchSnapshot, _provider: string): void {
    // No local match cache in Trigger runtime.
  }
}
