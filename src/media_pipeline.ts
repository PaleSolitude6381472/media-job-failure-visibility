import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const ingestionBody = z.object({ assetId: z.string().min(1), sourceUrl: z.string().url(), creatorId: z.string().min(1) });
export type Ingestion = z.infer<typeof ingestionBody>;
const queue = "media-delivery";

export async function ingestAsset(input: unknown, client = new InfraiClient()) {
  const asset = ingestionBody.parse(input);
  const message = await client.request<{ message_id: string }>("/v1/queue/publish", "POST", {
    queue,
    payload: { assetId: asset.assetId, sourceUrl: asset.sourceUrl, creatorId: asset.creatorId }
  });
  return { accepted: true, assetId: asset.assetId, messageId: message.message_id };
}

export async function processNext(client = new InfraiClient()) {
  const batch = await client.request<{ messages?: Array<{ message_id: string; payload: Ingestion }> }>("/v1/queue/consume", "POST", { queue, max_messages: 1, visibility_timeout: 60 });
  const message = batch.messages?.[0];
  if (!message) return { status: "idle" as const };
  try {
    await deliverToCreator(message.payload);
    await client.request("/v1/queue/ack", "POST", { queue, message_id: message.message_id });
    return { status: "delivered" as const, assetId: message.payload.assetId };
  } catch (exception) {
    await client.request("/v1/errors/capture", "POST", { exception });
    await client.request("/v1/queue/nack", "POST", { queue, message_id: message.message_id });
    return { status: "failed" as const, assetId: message.payload.assetId };
  }
}

async function deliverToCreator(asset: Ingestion) {
  if (asset.sourceUrl.includes("reject")) throw new Error("creator delivery rejected");
  return { delivered: asset.creatorId };
}

export async function scheduleDelivery(client = new InfraiClient()) {
  return client.request<{ job_id: string }>("/v1/cron/create", "POST", { cron_expr: "*/15 * * * *", task: "https://example.invalid/media/process" });
}

export async function inspectDelivery(jobId: string, client = new InfraiClient()) {
  return client.request(`/v1/cron/runs/list/${encodeURIComponent(jobId)}`, "GET");
}
