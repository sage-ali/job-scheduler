/**
 * End-to-end job processing performance test.
 *
 * Creates N jobs via the API (which enqueues them immediately into Bull),
 * then polls until every job reaches a terminal state and prints a latency
 * and throughput report.
 *
 * Usage:
 *   pnpm ts-node scripts/perf-test.ts [n=50] [--type=send_email|webhook_delivery|log_processing]
 *
 * Requires the API + at least one worker to be running.
 * Set max_retries=0 on every job so failures don't inflate the run time.
 */

const BASE = 'http://localhost:3000/api/v1';
const POLL_INTERVAL_MS = 1_000;
const TIMEOUT_MS = 5 * 60_000;

const TYPES = ['send_email', 'webhook_delivery', 'log_processing'] as const;
type JobType = (typeof TYPES)[number];

const PAYLOADS: Record<JobType, Record<string, unknown>> = {
  send_email: { to: 'perf@example.com', subject: 'Perf test' },
  webhook_delivery: { url: 'https://hooks.example.com/perf', method: 'POST', body: {} },
  log_processing: { source: 'perf-test', level: 'info', message: 'benchmark run' },
};

interface CreatedJob {
  id: string;
  createdAt: number;
}

interface FetchedJob {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getJob(id: string): Promise<FetchedJob> {
  const res = await fetch(`${BASE}/jobs/${id}`);
  if (!res.ok) throw new Error(`GET /jobs/${id} → ${res.status}`);
  const json = (await res.json()) as { data: FetchedJob };
  return json.data;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
}

async function main() {
  const args = process.argv.slice(2);
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '50', 10);
  const typeArg = args.find((a) => a.startsWith('--type='))?.split('=')[1];
  const type: JobType = TYPES.includes(typeArg as JobType) ? (typeArg as JobType) : 'send_email';

  console.log(`\n🔧  Perf test — ${n} × ${type} jobs`);
  console.log(`    API: ${BASE}`);
  console.log(`    max_retries: 0 (failures counted, not retried)\n`);

  // ── 1. Create jobs ────────────────────────────────────────────────────────
  process.stdout.write(`Creating ${n} jobs `);
  const created: CreatedJob[] = [];
  const batchStart = Date.now();

  for (let i = 0; i < n; i++) {
    const res = (await post('/jobs', {
      type,
      payload: { ...PAYLOADS[type], run: i },
      priority: 2,
      max_retries: 0,
    })) as { data: { id: string } };
    created.push({ id: res.data.id, createdAt: Date.now() });
    if (i % Math.max(1, Math.floor(n / 10)) === 0) process.stdout.write('.');
  }

  const createMs = Date.now() - batchStart;
  console.log(` done in ${fmt(createMs)} (${(n / (createMs / 1000)).toFixed(0)} req/s)\n`);

  // ── 2. Poll until all terminal ────────────────────────────────────────────
  const idSet = new Set(created.map((j) => j.id));
  const terminal = new Map<string, FetchedJob>();
  const deadline = Date.now() + TIMEOUT_MS;

  process.stdout.write('Waiting for workers');

  while (terminal.size < n) {
    if (Date.now() > deadline) {
      console.error(`\n\nTimeout — only ${terminal.size}/${n} jobs finished within ${fmt(TIMEOUT_MS)}`);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    process.stdout.write('.');

    const pending = [...idSet].filter((id) => !terminal.has(id));
    await Promise.all(
      pending.map(async (id) => {
        const job = await getJob(id);
        if (job.status === 'completed' || job.status === 'failed') {
          terminal.set(id, job);
        }
      }),
    );
  }

  const totalMs = Date.now() - batchStart;
  console.log(' all done!\n');

  // ── 3. Compute stats ──────────────────────────────────────────────────────
  const completed = [...terminal.values()].filter((j) => j.status === 'completed');
  const failed = [...terminal.values()].filter((j) => j.status === 'failed');

  // Processing latency: started_at → completed_at (time inside the worker)
  const processingMs = completed
    .filter((j) => j.started_at && j.completed_at)
    .map((j) => new Date(j.completed_at!).getTime() - new Date(j.started_at!).getTime())
    .sort((a, b) => a - b);

  // Queue wait time: created_at → started_at (time sitting in Bull/Redis before a worker claimed it)
  const waitMs = [...terminal.values()]
    .filter((j) => j.started_at)
    .map((j) => new Date(j.started_at!).getTime() - new Date(j.created_at).getTime())
    .sort((a, b) => a - b);

  const throughput = (n / (totalMs / 1000)).toFixed(1);

  // ── 4. Print report ───────────────────────────────────────────────────────
  const line = (label: string, value: string) =>
    console.log(`  ${label.padEnd(28)} ${value}`);

  console.log('─'.repeat(50));
  console.log('  RESULTS');
  console.log('─'.repeat(50));
  line('Jobs created', `${n}`);
  line('Completed', `${completed.length}`);
  line('Failed (max_retries=0)', `${failed.length}`);
  console.log('');
  line('Total wall time', fmt(totalMs));
  line('Job creation time', fmt(createMs));
  line('Processing wall time', fmt(totalMs - createMs));
  line('Throughput', `${throughput} jobs/sec`);

  if (waitMs.length > 0) {
    console.log('');
    line('Queue wait (created→started)', '');
    line('  min', fmt(waitMs[0]));
    line('  p50', fmt(percentile(waitMs, 50)));
    line('  p95', fmt(percentile(waitMs, 95)));
    line('  p99', fmt(percentile(waitMs, 99)));
    line('  max', fmt(waitMs[waitMs.length - 1]));
    line('  avg', fmt(waitMs.reduce((a, b) => a + b, 0) / waitMs.length));
  }

  if (processingMs.length > 0) {
    console.log('');
    line('Processing (started→completed)', '');
    line('  min', fmt(processingMs[0]));
    line('  p50', fmt(percentile(processingMs, 50)));
    line('  p95', fmt(percentile(processingMs, 95)));
    line('  p99', fmt(percentile(processingMs, 99)));
    line('  max', fmt(processingMs[processingMs.length - 1]));
    line('  avg', fmt(processingMs.reduce((a, b) => a + b, 0) / processingMs.length));
  }

  console.log('─'.repeat(50));
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
