import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("loads a usable dry-run config without secrets", () => {
    expect(loadConfig({}).dryRun).toBe(true);
  });

  it("requires production webhook configuration when dry run is disabled", () => {
    expect(() => loadConfig({ DRY_RUN: "false" })).toThrow("Missing required environment variable: WORLD_PREDICUP_API_BASE_URL");
  });

  it("rejects unsupported providers", () => {
    expect(() => loadConfig({ SPORTS_DATA_PROVIDER: "unknown" })).toThrow("Unsupported SPORTS_DATA_PROVIDER");
  });
});
