import { describe, expect, it } from "vitest";
import { buildWebhookUrl } from "./webhook-client.js";

describe("buildWebhookUrl", () => {
  it("joins a Supabase root URL with the function path", () => {
    expect(
      buildWebhookUrl("http://127.0.0.1:54321", "/functions/v1/live-match-webhook").toString(),
    ).toBe("http://127.0.0.1:54321/functions/v1/live-match-webhook");
  });

  it("preserves base URL path segments", () => {
    expect(
      buildWebhookUrl("http://127.0.0.1:54321/functions/v1", "/live-match-webhook").toString(),
    ).toBe("http://127.0.0.1:54321/functions/v1/live-match-webhook");
  });
});
