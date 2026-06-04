import type { WorkerConfig } from "./config.js";
import type { WebhookPayload } from "./types.js";

export interface WebhookDeliveryResult {
  status: "sent" | "dry_run";
  statusCode?: number;
}

export class WebhookClient {
  constructor(private readonly config: WorkerConfig) {}

  async send(payload: WebhookPayload, idempotencyKey: string): Promise<WebhookDeliveryResult> {
    if (this.config.dryRun) {
      console.log(JSON.stringify({ dryRun: true, idempotencyKey, payload }, null, 2));
      return { status: "dry_run" };
    }

    const url = buildWebhookUrl(this.config.worldPredicupApiBaseUrl, this.config.webhookPath);
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.worldPredicupWebhookToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return {
            status: "sent",
            statusCode: response.status,
          };
        }

        const responseBody = await response.text();
        lastError = new Error(`Webhook failed with ${response.status}: ${responseBody}`);
      } catch (error) {
        lastError = error;
      }

      await delay(250 * 2 ** (attempt - 1));
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export function buildWebhookUrl(baseUrl: string, webhookPath: string): URL {
  const base = baseUrl.replace(/\/+$/, "");
  const path = webhookPath.replace(/^\/+/, "");
  return new URL(`${base}/${path}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
