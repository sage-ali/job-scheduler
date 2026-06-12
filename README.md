# Job Scheduler

A full-stack background job scheduler built with NestJS, Bull + Redis, PostgreSQL, and React + Vite.

## Features

- **Priority queue** — jobs ordered by priority, scheduled time, and creation time via a min-heap
- **DAG workflows** — jobs can depend on other jobs; a job won't run until all dependencies complete
- **Recurring jobs** — completed recurring jobs automatically schedule the next run
- **Scheduled jobs** — jobs with a future `scheduled_at` wait until their time
- **Retries with backoff** — failed jobs retry up to 3 times with exponential backoff + jitter
- **Dead-letter queue** — exhausted jobs land in the DLQ for inspection and manual retry
- **Starvation prevention** — low-priority jobs gain effective priority the longer they wait
- **Duplicate protection** — Redis SETNX lock prevents two workers processing the same job
- **SSE live updates** — UI reflects status changes without a page refresh
- **Three job handlers** — `send_email`, `webhook_delivery`, `log_processing` (all simulated)

---

## Quick Start (local dev)

**Prerequisites:** Node 20+, Docker

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Create a .env file (see Environment Variables below)
cp .env.example .env

# 4. Run DB migrations
pnpm run migration:run

# 5. Start the API (http://localhost:3000)
pnpm run start:dev

# 6. In a second terminal, start the frontend (http://localhost:5173)
cd client && pnpm install && pnpm dev
```

**Seed data:**

```bash
# Populate the DB with demo jobs and DLQ entries (no server needed)
pnpm run seed:db

# Or fire live jobs through the API (server must be running — watch SSE in UI)
pnpm run seed:live
```

**API docs:** `http://localhost:3000/api/docs` (Swagger)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `DATABASE_HOST` | — | Postgres host |
| `DATABASE_PORT` | `5432` | Postgres port |
| `DATABASE_USER` | — | Postgres username |
| `DATABASE_PASSWORD` | — | Postgres password |
| `DATABASE_NAME` | — | Postgres database name |
| `DATABASE_SSL` | `false` | Enable SSL for Postgres |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password (optional) |
| `REDIS_TLS` | `false` | Enable TLS for Redis |
| `LOG_LEVEL` | `info` | Pino log level |
| `QUEUE_CONCURRENCY` | `3` | Bull worker concurrency |
| `DLQ_ALERT_THRESHOLD` | `10` | DLQ entry count that triggers an alert email |
| `ALERT_EMAIL` | `admin@example.com` | Recipient for DLQ threshold alerts |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI at `/api/docs` |

---

## Architecture

```
Browser (React + Vite + Tailwind)
  ├── Dashboard    — job counts by status
  ├── Jobs table   — filter, paginate, cancel
  ├── Create Job   — all fields including DAG depends_on
  └── DLQ view     — error details + manual retry button
        │
        │  HTTP REST + SSE (EventSource)
        ▼
NestJS API (port 3000)
  ├── JobsController    — CRUD + SSE endpoint
  ├── DlqController     — list + retry
  ├── SchedulerService  — cron sweep every 60s
  │     ├── HeapPriorityQueue  — orders batch by score/scheduledAt/createdAt
  │     └── boostStarvingJobs  — raises priority_score for long-waiting jobs
  ├── JobWorkerProcessor (Bull)
  │     ├── Redis SETNX lock   — duplicate protection
  │     ├── DAG check          — skip if dependencies unmet
  │     ├── dispatch()         — routes to correct handler
  │     └── onFailed()         — retry or DLQ
  └── SseService  — EventEmitter2 bus → Observable<MessageEvent>
        │
   ┌────┴────┐
Postgres    Redis
(jobs,      (Bull queue,
 dlq_jobs)   job locks)
```

---

## Heap Priority Queue

The scheduler sweep loads up to 50 eligible jobs from Postgres per tick and feeds them into a `HeapPriorityQueue` before enqueuing to Bull. This ensures jobs are dispatched in the correct order within each batch.

**Node shape:**

```
HeapNode { score, scheduledAt, createdAt, jobId }
```

**Ordering (strict):**

1. `score ASC` — lower score = higher effective priority
2. `scheduledAt ASC` — earlier scheduled time wins on tie (`null` = immediate = lowest possible value)
3. `createdAt ASC` — FIFO within the same batch

**Complexity:** `insert` O(log n), `popMin` O(log n), `peek` O(1)

**Why heap, not timing wheel:** The heap is priority-first. The timing wheel is time-first and has no concept of priority — all slots at the same delay are equivalent. For a scheduler where priority is the primary ordering criterion and Bull handles the actual delay, the heap is the right structure.

---

## Timing Wheel (Alternative Algorithm)

Implemented in `src/modules/scheduler/timing-wheel.ts` and benchmarked against the heap.

```
WHEEL_SIZE = 3600 slots  (1 slot = 1 second → covers 1 hour)

insert(entry, delayMs):
  slot = (currentSlot + floor(delayMs / 1000)) % WHEEL_SIZE
  if delayMs >= WHEEL_SIZE * 1000 → overflow bucket
  else wheel[slot].push(entry)

tick():
  currentSlot = (currentSlot + 1) % WHEEL_SIZE
  expired = wheel[currentSlot]; wheel[currentSlot] = []
  promote overflow entries now within range
  return expired
```

**Complexity:** `insert` O(1), `tick` O(k) where k = jobs in the current slot

**Strength:** Constant-time insert regardless of queue depth — wins at high N
**Weakness:** Fixed 1s granularity, priority is not first-class, jobs > 1h need overflow handling

---

## Benchmark Results

```
        N   heap:insert   heap:pop   wheel:insert   wheel:drain   insert winner   drain winner
─────────────────────────────────────────────────────────────────────────────────────────────
    1,000        1.00ms     3.57ms         0.43ms        1.00ms           wheel          wheel
   10,000        1.56ms     3.90ms         1.03ms        0.14ms           wheel          wheel
  100,000        6.99ms    32.94ms         8.80ms        0.07ms            heap          wheel
```

Wheel wins on insert at N=1k and N=10k (O(1) vs O(log n)). At N=100k the heap's insert
is faster in practice because the wheel's slot arrays grow large enough to pressure the
cache, while the heap's contiguous array stays warm. Wheel drain dominates at all sizes
because it scans 3600 slots once — O(k) total — vs the heap's O(n log n) full drain.

Run the benchmark yourself:

```bash
npx ts-node -r tsconfig-paths/register benchmark/scheduler.bench.ts
```

---

## Starvation Prevention

Low-priority jobs cannot wait forever. The scheduler sweep applies a score boost to any
`pending` job that has been waiting longer than the starvation threshold.

```
STARVATION_THRESHOLD  = 5 minutes
SCORE_BOOST_PER_MINUTE = 0.1

extra_wait_min = max(0, (now − created_at − THRESHOLD) / 60 000)
new_score      = max(0, priority_score − extra_wait_min × 0.1)
```

**Example:** A LOW priority job (initial score = 30) waiting 200 minutes beyond the threshold:

```
score reduction = 200 × 0.1 = 20  →  effective score = 10  (same as HIGH)
at 300 minutes  →  effective score = 0  (absolute maximum urgency)
```

Score never goes below 0. A LOW job reaches HIGH effective priority after ~200 minutes of starvation.

---

## DLQ Alert Threshold

Configured via `DLQ_ALERT_THRESHOLD` env var (default: **10 entries**).

When `dlq_jobs` count reaches the threshold, `DlqService.checkThresholdAndAlert()` fires
a simulated email alert to `ALERT_EMAIL` via `EmailSimulationHandler`. The handler uses
the same 15% failure / 100–600ms latency simulation as regular `send_email` jobs —
consistent with the project's mock-external-services approach.

Engineers can then:

- View each DLQ entry (type, payload, error message, retry count, last attempted)
- Trigger a manual retry — re-creates the job as a fresh `pending` entry
- A retried job that fails again after 3 attempts returns to the DLQ

---

## Cancellation of In-Flight Jobs

| Status at cancel time | Outcome |
|---|---|
| `pending` | Cancelled in DB; Bull job removed by ID |
| `processing` | `CANCELLED` written to DB immediately. The worker checks status before writing `COMPLETED` and discards the result. The handler may finish internally, but the DB record stays `CANCELLED`. This is **best-effort cancellation during processing** — documented by design. |
| `completed` / `failed` / `cancelled` | 400 Bad Request |

---

## Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm run test:watch

# With coverage
pnpm run test:cov
```

**86 tests across 10 suites** covering: JobsService, DlqService, SchedulerService,
JobWorkerProcessor, BackoffService, SseService, EmailSimulationHandler,
WebhookDeliveryHandler, LogProcessingHandler, HeapPriorityQueue, TimingWheel.

---

## API Reference

Full interactive docs at `<URL>/api/docs` (Swagger UI).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/jobs` | Create a job |
| `GET` | `/api/v1/jobs` | List jobs (filter by status/type/priority, paginated) |
| `GET` | `/api/v1/jobs/stats` | Job counts by status |
| `GET` | `/api/v1/jobs/:id` | Get a single job |
| `PATCH` | `/api/v1/jobs/:id/cancel` | Cancel a job |
| `GET` | `/api/v1/jobs/events` | SSE stream of job lifecycle events |
| `GET` | `/api/v1/dlq` | List DLQ entries |
| `POST` | `/api/v1/dlq/:id/retry` | Retry a DLQ entry |
