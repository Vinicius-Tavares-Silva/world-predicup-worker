import type { ProviderMatchSnapshot, SentUpdateRecord, SyncRunRecord } from "../types.js";

export interface StateStore {
  createSyncRun(): SyncRunRecord;
  finishSyncRun(id: number, status: "success" | "failed", errorMessage?: string): void;
  hasSentUpdate(idempotencyKey: string): boolean;
  recordSentUpdate(record: SentUpdateRecord): void;
  upsertMatch(snapshot: ProviderMatchSnapshot, provider: string): void;
  close?(): void;
}
