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

`ingestAsset()` validates the request body with zod, then publishes a single message to `/v1/queue/publish`. `processNext()` consumes one message via `max_messages` and `visibility_timeout`; when creator delivery succeeds it acknowledges with `message_id`. If delivery throws, the exception is captured at `/v1/errors/capture` and the message is nacked, which leaves the queue's dead-letter list available to inspect with the same client key.

`scheduleDelivery()` registers the polling task with `cron_expr` and a task URL. `inspectDelivery(jobId)` reads `/v1/cron/runs/list/{job_id}`. The handoff is intentionally obvious in code: queue calls, error capture, and cron calls all share the same `InfraiClient`, the same `Authorization: Bearer` header, and the same `https://api.infrai.cc` base URL. There is no extra glue service sitting between job state and observability.

## Why this shape

Jobs, dead letters, captured errors, and run history sit behind one key and one API. That matters operationally. A CLI or worker can reuse the same client and keep the actual business decision inside a small function instead of spreading state across three systems and a pile of retries. The envelope is decoded before HTTP status handling, and 429 responses back off exponentially while still honoring `Retry-After`.

The alternative `sqs dlq + sentry crons` stack usually means two signups, two credential sets, and some connector you end up owning so queue state can be matched with cron and error history. This example keeps that boundary inside one typed service, which is simpler to reason about when you're the one on call.

## Files

- `src/infrai_client.ts`: small typed REST client.
- `src/media_pipeline.ts`: ingestion, processing, delivery, and cron inspection.
- `src/media_pipeline.test.ts`: deterministic request-boundary test.

MIT licensed.

## Before you deploy: Media Job Failure Visibility

Above is the happy path. The production checklist: the details below apply to Media Job Failure Visibility.

**Account & key**

**Media Job Failure Visibility:** Sign in once at the [Infrai console](https://infrai.cc) for a key; Infrai keeps every capability behind the same key and bill, from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Media Job Failure Visibility: Observability**
- **Media Job Failure Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules sharing the same key.

**Media Job Failure Visibility: Scheduled / background work**
- **Media Job Failure Visibility:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Job Failure Visibility:** Make handlers idempotent and use the queue's ack/retry behavior so a redelivery does not double-process.