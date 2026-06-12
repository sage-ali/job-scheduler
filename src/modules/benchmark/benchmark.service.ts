import { Injectable } from '@nestjs/common';
import { HeapPriorityQueue } from '../scheduler/heap';
import { TimingWheel, WHEEL_SIZE } from '../scheduler/timing-wheel';

export interface BenchmarkResult {
  n: number;
  heap: { insertMs: number; drainMs: number };
  wheel: { insertMs: number; drainMs: number };
  insertWinner: 'heap' | 'wheel';
  drainWinner: 'heap' | 'wheel';
}

@Injectable()
export class BenchmarkService {
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
}
