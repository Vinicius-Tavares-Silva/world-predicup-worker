import type { LiveDataProvider } from "./types.js";
import type { WorkerConfig } from "./config.js";
import { ApiFootballProvider } from "./providers/api-football.js";
import { MockLiveDataProvider } from "./providers/mock.js";
import { Wc2026Provider } from "./providers/wc2026.js";

export function createProvider(config: WorkerConfig): LiveDataProvider {
  switch (config.sportsDataProvider) {
    case "api-football":
      return new ApiFootballProvider(config);
    case "wc2026":
      return new Wc2026Provider(config);
    case "mock":
      return new MockLiveDataProvider();
  }
}
