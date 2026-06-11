/**
 * Compares HeapPriorityQueue vs TimingWheel at N = 1 000 / 10 000 / 100 000 jobs.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register benchmark/scheduler.bench.ts
 */
import { HeapPriorityQueue, HeapNode } from '../src/modules/scheduler/heap';
import { TimingWheel, TimingWheelEntry, WHEEL_SIZE } from '../src/modules/scheduler/timing-wheel';

const SIZES = [1_000, 10_000, 100_000];

// ---------------------------------------------------------------------------
// Synthetic data
// ---------------------------------------------------------------------------

function makeHeapNodes(n: number): HeapNode[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => ({
    jobId: `job-${i}`,
    score: Math.random() * 30,
    scheduledAt: Math.random() > 0.5 ? new Date(now.getTime() + Math.random() * 3_600_000) : null,
    createdAt: new Date(now.getTime() - Math.random() * 60_000),
  }));
}

function makeWheelEntries(n: number): Array<{ entry: TimingWheelEntry; delayMs: number }> {
  return Array.from({ length: n }, (_, i) => ({
    entry: { jobId: `job-${i}` },
    // Cap at WHEEL_SIZE - 1 seconds so every insert hits the O(1) in-wheel path
    delayMs: Math.floor(Math.random() * (WHEEL_SIZE - 1)) * 1000,
  }));
}

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

function hrMs(): number {
  const [s, ns] = process.hrtime();
  return s * 1_000 + ns / 1_000_000;
}

function memDeltaMb(before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage): string {
  return ((after.heapUsed - before.heapUsed) / 1_048_576).toFixed(2);
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

function benchHeap(nodes: HeapNode[]): { insertMs: number; popMs: number; memMb: string } {
  const heap = new HeapPriorityQueue();

  const memBefore = process.memoryUsage();
  const t0 = hrMs();
  for (const node of nodes) heap.insert(node);
  const insertMs = hrMs() - t0;

  const t1 = hrMs();
  while (heap.size() > 0) heap.popMin();
  const popMs = hrMs() - t1;
  const memMb = memDeltaMb(memBefore, process.memoryUsage());

  return { insertMs, popMs, memMb };
}

function benchWheel(
  entries: Array<{ entry: TimingWheelEntry; delayMs: number }>,
): { insertMs: number; drainMs: number; memMb: string } {
  const wheel = new TimingWheel(0);

  const memBefore = process.memoryUsage();
  const t0 = hrMs();
  for (const { entry, delayMs } of entries) wheel.insert(entry, delayMs);
  const insertMs = hrMs() - t0;

  // Tick all WHEEL_SIZE slots to drain every entry
  const t1 = hrMs();
  for (let i = 0; i < WHEEL_SIZE; i++) wheel.tick(i * 1000);
  const drainMs = hrMs() - t1;
  const memMb = memDeltaMb(memBefore, process.memoryUsage());

  return { insertMs, drainMs, memMb };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const COL = { n: 9, ms: 16, mem: 14 };

function pad(s: string | number, w: number): string {
  return String(s).padStart(w);
}

function winner(heapMs: number, wheelMs: number): string {
  if (heapMs < wheelMs) return 'heap';
  if (wheelMs < heapMs) return 'wheel';
  return 'tie';
}

console.log('\n=== Scheduler Algorithm Benchmark ===\n');
console.log(
  [
    pad('N', COL.n),
    pad('heap:insert(ms)', COL.ms),
    pad('heap:pop(ms)', COL.ms),
    pad('wheel:insert(ms)', COL.ms),
    pad('wheel:drain(ms)', COL.ms),
    pad('insert winner', COL.mem),
    pad('drain winner', COL.mem),
    pad('heap mem(MB)', COL.mem),
    pad('wheel mem(MB)', COL.mem),
  ].join('  '),
);
console.log('─'.repeat(130));

for (const n of SIZES) {
  // Force GC between runs if available (node --expose-gc)
  if (typeof global.gc === 'function') global.gc();

  const heapNodes = makeHeapNodes(n);
  const wheelEntries = makeWheelEntries(n);

  const { insertMs: hi, popMs: hp, memMb: hm } = benchHeap(heapNodes);
  const { insertMs: wi, drainMs: wd, memMb: wm } = benchWheel(wheelEntries);

  console.log(
    [
      pad(n.toLocaleString(), COL.n),
      pad(hi.toFixed(2), COL.ms),
      pad(hp.toFixed(2), COL.ms),
      pad(wi.toFixed(2), COL.ms),
      pad(wd.toFixed(2), COL.ms),
      pad(winner(hi, wi), COL.mem),
      pad(winner(hp, wd), COL.mem),
      pad(hm, COL.mem),
      pad(wm, COL.mem),
    ].join('  '),
  );
}

console.log('\nNotes:');
console.log('  heap:insert  — O(log n)  push + bubbleUp');
console.log('  heap:pop     — O(log n)  swap root↔tail + bubbleDown, repeated n times');
console.log('  wheel:insert — O(1)      compute slot index, push to array');
console.log(`  wheel:drain  — O(k) × ${WHEEL_SIZE} ticks, k = jobs per slot`);
console.log('  wheel delays capped at WHEEL_SIZE-1 s so no overflow bucket is exercised');
console.log('  memory delta measured as heap-used difference before/after populate\n');
