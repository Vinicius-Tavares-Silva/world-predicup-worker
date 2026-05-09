import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ProviderMatchSnapshot, SentUpdateRecord, SyncRunRecord } from "../types.js";
import type { StateStore } from "./state-store.js";

export class SqliteStateStore implements StateStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initialize();
  }

  createSyncRun(): SyncRunRecord {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO sync_runs (started_at, status) VALUES (?, ?) RETURNING id")
      .get(startedAt, "running") as { id: number };

    return {
      id: result.id,
      startedAt,
      status: "running",
    };
  }

  finishSyncRun(id: number, status: "success" | "failed", errorMessage?: string): void {
    this.db
      .prepare("UPDATE sync_runs SET finished_at = ?, status = ?, error_message = ? WHERE id = ?")
      .run(new Date().toISOString(), status, errorMessage ?? null, id);
  }

  hasSentUpdate(idempotencyKey: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM sent_updates WHERE idempotency_key = ?").get(idempotencyKey);
    return row !== undefined;
  }

  recordSentUpdate(record: SentUpdateRecord): void {
    this.db
      .prepare(`
        INSERT OR IGNORE INTO sent_updates (
          idempotency_key,
          external_match_id,
          update_type,
          sent_at,
          payload_hash
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(record.idempotencyKey, record.externalMatchId, record.updateType, record.sentAt, record.payloadHash);
  }

  upsertMatch(snapshot: ProviderMatchSnapshot, provider: string): void {
    this.db
      .prepare(`
        INSERT INTO matches (
          provider,
          external_match_id,
          home_team,
          away_team,
          kickoff_at,
          status,
          last_minute,
          home_score,
          away_score,
          last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, external_match_id) DO UPDATE SET
          home_team = excluded.home_team,
          away_team = excluded.away_team,
          kickoff_at = excluded.kickoff_at,
          status = excluded.status,
          last_minute = excluded.last_minute,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          last_synced_at = excluded.last_synced_at
      `)
      .run(
        provider,
        snapshot.externalMatchId,
        snapshot.homeTeam.name,
        snapshot.awayTeam.name,
        snapshot.kickoffAt,
        snapshot.status,
        snapshot.minute,
        snapshot.score.home,
        snapshot.score.away,
        new Date().toISOString(),
      );
  }

  close(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_match_id TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        kickoff_at TEXT NOT NULL,
        status TEXT NOT NULL,
        last_minute INTEGER,
        home_score INTEGER NOT NULL,
        away_score INTEGER NOT NULL,
        last_synced_at TEXT NOT NULL,
        UNIQUE(provider, external_match_id)
      );

      CREATE TABLE IF NOT EXISTS sent_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idempotency_key TEXT NOT NULL UNIQUE,
        external_match_id TEXT NOT NULL,
        update_type TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        payload_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        error_message TEXT
      );
    `);
  }
}
