import { readFileSync } from "node:fs";
import type { MatchScheduleEntry } from "./match-schedule.js";

type Wc2026ScheduleArtifactRow = {
  externalMatchId?: string | number;
  id?: string | number;
  kickoffAt?: string;
  kickoff_utc?: string;
  stage?: "group_stage" | "knockout";
  round?: string;
};

export function loadWc2026ScheduleArtifact(path: string): MatchScheduleEntry[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`WC2026 schedule artifact must be a JSON array: ${path}`);
  }

  return parsed.map((row, index) => mapScheduleArtifactRow(row, index));
}

function mapScheduleArtifactRow(row: unknown, index: number): MatchScheduleEntry {
  if (!row || typeof row !== "object") {
    throw new Error(`WC2026 schedule artifact row ${index} must be an object`);
  }

  const value = row as Wc2026ScheduleArtifactRow;
  const kickoffAt = value.kickoffAt ?? value.kickoff_utc;
  const stage = value.stage ?? (value.round ? (value.round === "group" ? "group_stage" : "knockout") : undefined);

  if (!kickoffAt) {
    throw new Error(`WC2026 schedule artifact row ${index} is missing kickoffAt or kickoff_utc`);
  }

  if (!stage) {
    throw new Error(`WC2026 schedule artifact row ${index} is missing stage or round`);
  }

  return {
    externalMatchId: value.externalMatchId === undefined && value.id === undefined
      ? undefined
      : String(value.externalMatchId ?? value.id),
    kickoffAt,
    stage,
  };
}
