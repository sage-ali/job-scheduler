# Job Scheduler

A full-stack background job scheduler built with NestJS, Bull + Redis, PostgreSQL, and React + Vite.

## Features

- **Priority queue** — jobs ordered by priority, scheduled time, and creation time via a min-heap
- **DAG workflows** — jobs can depend on other jobs; dependency on a failed/cancelled job cascade-fails the dependent immediately
- **Recurring jobs** — completed recurring jobs automatically schedule the next run
- **Scheduled jobs** — jobs with a future `scheduled_at` wait until their time
- **Configurable retries** — `max_retries` per job (0–3); failed jobs retry with exponential backoff + jitter
- **Dead-letter queue** — exhausted jobs land in the DLQ for inspection and manual retry
- **Starvation prevention** — low-priority jobs gain effective priority the longer they wait
- **Stall recovery** — worker jobs holding a lease past `LEASE_TTL_SECONDS` are reset to `pending`
- **Duplicate protection** — atomic DB claim (`UPDATE … WHERE status = 'pending'`) prevents two workers taking the same job
- **Queue pause / resume** — halt job dispatch without stopping workers; in-flight jobs finish
- **SSE live updates** — worker events bridge to the API via Redis pub/sub; UI reflects changes without polling
- **Throughput benchmark** — built-in endpoint creates real jobs, waits for completion, and reports latency percentiles
- **Three job handlers** — `send_email`, `webhook_delivery`, `log_processing` (all simulated with realistic latency and failure rates)

---

## Quick Start (local dev)

**Prerequisites:** Node 22+, Docker

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install dependencies (root + client)
pnpm install
cd client && pnpm install && cd ..

# 3. Copy env file
cp .env.example .env

# 4. Run DB migrations
pnpm migration:run

# 5. Start API + worker together (recommended)
pnpm dev
```

`pnpm dev` starts the API on `http://localhost:3000` and one worker process in the same terminal with colour-coded, labelled output (`[api]` / `[worker]`).

**Frontend** (separate terminal):

```bash
cd client && pnpm dev   # http://localhost:5173
```

**Multiple workers for load testing:**

```bash
pnpm dev:4workers   # API + 4 worker processes
```

**Seed data:**

```bash
pnpm seed:db    # Populate DB with demo jobs (server not required)
pnpm seed:live  # Fire live jobs through the API (server must be running)
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
| `QUEUE_CONCURRENCY` | `3` | Concurrent job slots per worker process |
| `LEASE_TTL_SECONDS` | `120` | Seconds a worker holds a job before it is considered stalled |
| `DLQ_ALERT_THRESHOLD` | `10` | DLQ entry count that triggers an alert email |
| `ALERT_EMAIL` | `admin@example.com` | Recipient for DLQ threshold alerts |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI at `/api/docs` |

**Production only (PM2 / ecosystem.config.js):**

| Variable           | Default | Description                             |
|--------------------|---------|-----------------------------------------|
| `WORKER_INSTANCES` | `1`     | Number of worker PM2 instances to start |

---

## Architecture

The API and worker run as **separate processes**. The worker has no HTTP server — it only connects to Postgres and Redis. Worker lifecycle events are bridged back to the API via a Redis pub/sub channel so the SSE stream stays live.

```
Browser (React + Vite + Tailwind)
  ├── Dashboard    — live job counts, queue status, worker count
  ├── Jobs         — filter, paginate, cancel
  ├── Create Job   — all fields including DAG depends_on and max_retries
  ├── DLQ          — paginated error list + manual retry
  └── Benchmark    — algorithm comparison + live throughput test
        │
        │  HTTP REST + SSE (EventSource)
        ▼
NestJS API  (dist/main.js, port 3000)
  ├── JobsController       — CRUD + pause/resume + SSE endpoint
  ├── DlqController        — list (paginated) + retry
  ├── BenchmarkController  — algorithm bench + throughput test
  ├── SchedulerService     — cron sweep every 60s
  │     ├── recoverStalledJobs   — reset jobs whose lease expired
  │     ├── HeapPriorityQueue    — orders batch by score/scheduledAt/createdAt
  │     ├── enqueueReadyJobs     — DAG check + Bull enqueue
  │     └── boostStarvingJobs    — raises priority_score for long-waiting jobs
  └── SseService  — Redis SUB → EventEmitter2 → Observable<MessageEvent>
        │                              ▲
        │                              │ Redis PUB (worker events)
        ▼                              │
     Postgres ◄──────────────── NestJS Worker  (dist/worker.js)
     (jobs,                       └── JobWorkerProcessor (Bull)
      dlq_jobs)                         ├── atomic DB claim (UPDATE … WHERE pending)
                                        ├── DAG check + cascade-fail
                                        ├── dispatch() → handler
                                        └── onFailed() → retry or DLQ
                                               │
                                             Redis
                                        (Bull queue, job locks,
                                         SSE pub/sub channel)
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

## Algorithm Benchmark

Compare the heap and timing wheel live via the Benchmark page in the UI, or hit the API directly:

```
GET /api/v1/benchmark?n=10000
```

Sample results:

```
        N   heap:insert   heap:drain   wheel:insert   wheel:drain   insert winner   drain winner
─────────────────────────────────────────────────────────────────────────────────────────────────
    1,000        1.00ms      3.57ms         0.43ms        1.00ms           wheel          wheel
   10,000        1.56ms      3.90ms         1.03ms        0.14ms           wheel          wheel
  100,000        6.99ms     32.94ms         8.80ms        0.07ms            heap          wheel
```

Wheel wins insert at N=1k and N=10k (O(1) vs O(log n)). At N=100k the heap is faster in practice because the wheel's slot arrays grow large enough to pressure the cache. Wheel drain dominates at all sizes — O(k) total vs the heap's O(n log n).

---

## Throughput Benchmark

The `POST /api/v1/benchmark/throughput` endpoint creates N real jobs (with `max_retries=0`), waits for every job to reach a terminal state, and returns latency percentiles. Available through the Benchmark page in the UI.

```
POST /api/v1/benchmark/throughput
{ "n": 100, "type": "send_email" }
```

Response includes:

| Field | Description |
|---|---|
| `queueWait` | Time from job creation to worker pickup (scheduler + Bull overhead) |
| `processing` | Time from worker pickup to completion (handler + DB write) |
| Both have | `min`, `p50`, `p95`, `p99`, `max`, `avg` |

CLI equivalent:

```bash
pnpm perf          # 50 send_email jobs (default)
pnpm perf 100      # 100 jobs
pnpm perf 200 --type=webhook_delivery
```

---

## Starvation Prevention

Low-priority jobs cannot wait forever. The scheduler sweep applies a score boost to any `pending` job that has been waiting longer than the starvation threshold.

```
STARVATION_THRESHOLD   = 5 minutes
SCORE_BOOST_PER_MINUTE = 0.1

new_score = max(0, priority_score − (wait_beyond_threshold_min × 0.1))
```

**Example:** A LOW priority job (initial score = 30) waiting 200 minutes beyond the threshold:

```
score reduction = 200 × 0.1 = 20  →  effective score = 10  (same as HIGH)
at 300 minutes  →  effective score = 0  (absolute maximum urgency)
```

Score never goes below 0. A LOW job reaches HIGH effective priority after ~200 minutes of starvation.

---

## Stall Recovery

If a worker crashes mid-job, its lease expires after `LEASE_TTL_SECONDS` (default 120s). The next scheduler sweep detects jobs where `status = processing AND lease_expires_at < now` and resets them to `pending`. They re-enter the queue on the following sweep.

---

## DAG Cascade Failure

If a `depends_on` dependency reaches a terminal state (`FAILED` or `CANCELLED`), any job waiting on it is immediately marked `FAILED` on the next scheduler sweep. It never gets stuck in `pending` indefinitely. The event is logged as `scheduler_dag_cascade_fail`.

---

## DLQ Alert Threshold

Configured via `DLQ_ALERT_THRESHOLD` (default: **10 entries**).

When `dlq_jobs` count reaches the threshold, `DlqService.checkThresholdAndAlert()` fires a simulated email alert to `ALERT_EMAIL`. Engineers can then:

- View each DLQ entry (type, payload, error message, retry count, last attempted)
- Trigger a manual retry — re-creates the job as a fresh `pending` entry
- A retried job that fails again after exhausting retries returns to the DLQ

---

## Cancellation of In-Flight Jobs

| Status at cancel time | Outcome |
|---|---|
| `pending` | Cancelled in DB; Bull job removed by ID |
| `processing` | `CANCELLED` written to DB immediately. The worker checks status before writing `COMPLETED` and discards the result. The handler may finish internally, but the DB record stays `CANCELLED`. Best-effort cancellation — by design. |
| `completed` / `failed` / `cancelled` | 400 Bad Request |

---

## Running Tests

```bash
pnpm test            # all tests
pnpm test:watch      # watch mode
pnpm test:cov        # with coverage
```

Tests cover: JobsService, DlqService, SchedulerService, JobWorkerProcessor, BackoffService, SseService, EmailSimulationHandler, WebhookDeliveryHandler, LogProcessingHandler, HeapPriorityQueue, TimingWheel.

---

## API Reference

Full interactive docs at `http://localhost:3000/api/docs` (Swagger).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/jobs` | Create a job |
| `GET` | `/api/v1/jobs` | List jobs (filter by status/type/priority, paginated) |
| `GET` | `/api/v1/jobs/stats` | Job counts by status |
| `GET` | `/api/v1/jobs/:id` | Get a single job |
| `PATCH` | `/api/v1/jobs/:id/cancel` | Cancel a job |
| `GET` | `/api/v1/jobs/events` | SSE stream of job lifecycle events |
| `GET` | `/api/v1/queue/status` | Queue status (active, waiting, paused, worker count) |
| `POST` | `/api/v1/queue/pause` | Pause job dispatch |
| `POST` | `/api/v1/queue/resume` | Resume job dispatch |
| `GET` | `/api/v1/dlq` | List DLQ entries (paginated) |
| `POST` | `/api/v1/dlq/:id/retry` | Retry a DLQ entry |
| `GET` | `/api/v1/benchmark` | Algorithm benchmark (heap vs timing wheel) |
| `POST` | `/api/v1/benchmark/throughput` | Live throughput test with latency percentiles |

---

## Production Deployment

The app ships two PM2 processes via `ecosystem.config.js`:

| Process | Script | Role |
|---|---|---|
| `api` | `dist/main.js` | HTTP server, scheduler, SSE |
| `worker` | `dist/worker.js` | Bull processor, no HTTP |

```bash
# First deploy
pm2 start ecosystem.config.js --env production
pm2 save

# Subsequent deploys (zero-downtime reload)
pm2 reload ecosystem.config.js --env production --update-env

# Scale workers (set in server .env before reloading)
WORKER_INSTANCES=2
```
