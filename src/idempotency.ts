import { createHash } from "node:crypto";
import type { ProviderMatchEvent, WebhookPayload } from "./types.js";

export function snapshotIdempotencyKey(payload: WebhookPayload): string {
  const keyParts = [
    "snapshot",
    payload.source,
    payload.externalMatchId,
    payload.minute ?? "unknown",
    payload.score.home,
    payload.score.away,
    payload.status,
  ];

  if (payload.penaltyScore) {
    keyParts.push("pen", String(payload.penaltyScore.home), String(payload.penaltyScore.away));
  }

  if (payload.winnerTeam) {
    keyParts.push("winner", payload.winnerTeam.id);
  }

  return keyParts.join(":");
}

export function eventIdempotencyKey(source: string, externalMatchId: string, event: ProviderMatchEvent): string {
  return ["event", source, externalMatchId, event.externalEventId].join(":");
}

export function payloadHash(payload: WebhookPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
