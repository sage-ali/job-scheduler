import { Injectable } from '@nestjs/common';
import { HeapPriorityQueue } from '../scheduler/heap';
import { TimingWheel, WHEEL_SIZE } from '../scheduler/timing-wheel';
import { JobsService } from '../jobs/jobs.service';
import { JobModelAction } from '../jobs/jobs.model-action';
import { JobType } from '../jobs/enums/job-type.enum';
import { JobStatus } from '../jobs/enums/job-status.enum';

export interface BenchmarkResult {
  n: number;
  heap: { insertMs: number; drainMs: number };
  wheel: { insertMs: number; drainMs: number };
  insertWinner: 'heap' | 'wheel';
  drainWinner: 'heap' | 'wheel';
}

interface LatencyStats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

export interface ThroughputResult {
  n: number;
  type: JobType;
  completed: number;
  failed: number;
  totalMs: number;
  createMs: number;
  throughputPerSec: number;
  queueWait: LatencyStats;
  processing: LatencyStats;
}

const PAYLOADS: Record<JobType, Record<string, unknown>> = {
  [JobType.SEND_EMAIL]: { to: 'bench@example.com', subject: 'Throughput benchmark' },
  [JobType.WEBHOOK_DELIVERY]: { url: 'https://hooks.example.com/bench', method: 'POST', body: {} },
  [JobType.LOG_PROCESSING]: { source: 'benchmark', level: 'info', message: 'throughput run' },
};

function pct(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(ms: number[]): LatencyStats {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] ?? 0,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    avg: Math.round(sum / sorted.length),
  };
}

@Injectable()
export class BenchmarkService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobModelAction: JobModelAction,
  ) {}

  run(n: number): BenchmarkResult {
    const nowMs = Date.now();

    // ── Heap ──────────────────────────────────────────────────────────────
    const heap = new HeapPriorityQueue();

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      heap.insert({
        score: (i % 3) + 1,
        scheduledAt: i % 2 === 0 ? new Date(nowMs + i * 1000) : null,
        createdAt: new Date(nowMs + i),
        jobId: `job-${i}`,
      });
    }
    const heapInsertMs = performance.now() - t0;

    const t1 = performance.now();
    while (heap.size() > 0) heap.popMin();
    const heapDrainMs = performance.now() - t1;

    // ── Timing wheel ──────────────────────────────────────────────────────
    const wheel = new TimingWheel(nowMs);

    const t2 = performance.now();
    for (let i = 0; i < n; i++) {
      wheel.insert({ jobId: `job-${i}` }, (i % WHEEL_SIZE) * 1000);
    }
    const wheelInsertMs = performance.now() - t2;

    const t3 = performance.now();
    for (let tick = 1; tick <= WHEEL_SIZE; tick++) {
      wheel.tick(nowMs + tick * 1000);
    }
    const wheelDrainMs = performance.now() - t3;

    return {
      n,
      heap: { insertMs: +heapInsertMs.toFixed(2), drainMs: +heapDrainMs.toFixed(2) },
      wheel: { insertMs: +wheelInsertMs.toFixed(2), drainMs: +wheelDrainMs.toFixed(2) },
      insertWinner: heapInsertMs <= wheelInsertMs ? 'heap' : 'wheel',
      drainWinner: heapDrainMs <= wheelDrainMs ? 'heap' : 'wheel',
    };
  }

  async runThroughput(n: number, type: JobType): Promise<ThroughputResult> {
    const count = Math.min(Math.max(n, 10), 200);
    const batchStart = Date.now();

    // Create all jobs concurrently in batches of 20 to avoid saturating the DB connection pool.
    const BATCH = 20;
    const jobIds: string[] = [];
    for (let i = 0; i < count; i += BATCH) {
      const slice = Math.min(BATCH, count - i);
      const batch = await Promise.all(
        Array.from({ length: slice }, (_, j) =>
          this.jobsService.createJob({
            type,
            payload: { ...PAYLOADS[type], run: i + j },
            priority: 2,
            max_retries: 0,
          }),
        ),
      );
      batch.forEach((job) => jobIds.push(job.id));
    }

    const createMs = Date.now() - batchStart;

    // Poll until every job is in a terminal state.
    const terminal = new Map<
      string,
      { status: string; created_at: Date; started_at: Date | null; completed_at: Date | null }
    >();
    const deadline = Date.now() + 120_000;

    while (terminal.size < count) {
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 500));

      const pending = jobIds.filter((id) => !terminal.has(id));
      const jobs = await this.jobModelAction.findJobsByIds(pending);
      for (const job of jobs) {
        if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
          terminal.set(job.id, {
            status: job.status,
            created_at: job.created_at,
            started_at: job.started_at,
            completed_at: job.completed_at,
          });
        }
      }
    }

    const totalMs = Date.now() - batchStart;
    const allJobs = [...terminal.values()];
    const completed = allJobs.filter((j) => j.status === JobStatus.COMPLETED);
    const failed = allJobs.filter((j) => j.status === JobStatus.FAILED);

    const waitMs = allJobs
      .filter((j) => j.started_at)
      .map((j) => j.started_at!.getTime() - j.created_at.getTime());

    const processingMs = completed
      .filter((j) => j.started_at && j.completed_at)
      .map((j) => j.completed_at!.getTime() - j.started_at!.getTime());

    return {
      n: count,
      type,
      completed: completed.length,
      failed: failed.length,
      totalMs,
      createMs,
      throughputPerSec: +((count / totalMs) * 1000).toFixed(1),
      queueWait: stats(waitMs.length > 0 ? waitMs : [0]),
      processing: stats(processingMs.length > 0 ? processingMs : [0]),
    };
  }
}
