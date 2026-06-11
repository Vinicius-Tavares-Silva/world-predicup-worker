import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWc2026ScheduleArtifact } from "./wc2026-schedule-artifact.js";

describe("loadWc2026ScheduleArtifact", () => {
  it("loads raw WC2026 /matches rows as schedule entries", () => {
    const path = writeArtifact([
      {
        id: 1,
        round: "group",
        kickoff_utc: "2026-06-11T20:00:00.000Z",
      },
      {
        id: 101,
        round: "round_of_32",
        kickoff_utc: "2026-06-28T18:00:00.000Z",
      },
    ]);

    expect(loadWc2026ScheduleArtifact(path)).toEqual([
      {
        externalMatchId: "1",
        kickoffAt: "2026-06-11T20:00:00.000Z",
        stage: "group_stage",
      },
      {
        externalMatchId: "101",
        kickoffAt: "2026-06-28T18:00:00.000Z",
        stage: "knockout",
      },
    ]);
  });
});

function writeArtifact(rows: unknown[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "wc2026-schedule-")), "schedule.json");
  writeFileSync(path, JSON.stringify(rows), "utf8");
  return path;
}
