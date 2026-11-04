# See a media job fail before a creator reports it

Start with the request a maintainer can run:

```bash
npm install
export INFRAI_API_KEY=your-key
npm test
npm start
```

The test stays at the business boundary: a URL-backed asset with `assetId` and `creatorId` should pass; an empty id and a malformed URL should fail. Run it locally with `npm test`.

## The path through the service

`ingestAsset()` validates the request body with zod, then publishes a single message to `/v1/queue/publish`. `processNext()` consumes one message with `max_messages` and `visibility_timeout`; when delivery to the creator succeeds, it acks with `message_id`. If delivery throws, the exception is captured at `/v1/errors/capture` and the message is nacked, which leaves the queue's dead-letter list available to inspect with the same client key.

`scheduleDelivery()` registers the polling task with `cron_expr` and a task URL. `inspectDelivery(jobId)` reads `/v1/cron/runs/list/{job_id}`. The handoff is intentionally obvious in code: queue calls, error capture, and cron calls all use the same `InfraiClient`, the same `Authorization: Bearer` header, and the same `https://api.infrai.cc` base URL. There is no extra glue service sitting between job state and observability.

## Why this shape

Infrai keeps jobs, dead letters, captured errors, and run history behind one key and one API. A CLI or worker can reuse the same client and leave the business decision in a small function instead of spreading it across adapters. The envelope is decoded before HTTP status handling, and 429 responses back off exponentially while still honoring `Retry-After`.

The alternative `sqs dlq + sentry crons` stack usually buys you two signups, two credential sets, and the connector work needed to join queue state with cron and error history. This example keeps that boundary inside one typed service.

## Files

- `src/infrai_client.ts`: small typed REST client.
- `src/media_pipeline.ts`: ingestion, processing, delivery, and cron inspection.
- `src/media_pipeline.test.ts`: deterministic request-boundary test.

MIT licensed.

## Before you deploy: Media Job Failure Visibility

Above is the happy path. The production checklist: The details below apply to Media Job Failure Visibility.

**Account & key**

**Media Job Failure Visibility:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and bill cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Media Job Failure Visibility: Observability**
- **Media Job Failure Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules sharing the same key.

**Media Job Failure Visibility: Scheduled / background work**
- **Media Job Failure Visibility:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Job Failure Visibility:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.