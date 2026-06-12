/**
 * Live seed script — fires POST /jobs via the API.
 * Requires the NestJS server to be running on localhost:3000.
 * Jobs are processed by the real worker, so you see SSE events in the UI.
 *
 * Usage:  npx ts-node scripts/seed-live.ts
 */

const BASE = 'http://localhost:3000/api/v1';

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  console.log('Seeding live jobs via API…\n');

  // 1. Immediate send_email jobs (high → low priority)
  for (const [to, priority, subject] of [
    ['high@example.com', 1, 'Urgent: Account locked'],
    ['med@example.com',  2, 'Your weekly summary'],
    ['low@example.com',  3, 'Newsletter — June edition'],
  ] as [string, number, string][]) {
    const res: any = await post('/jobs', { type: 'send_email', payload: { to, subject }, priority });
    console.log(`Created send_email [priority=${priority}] → ${res.data.id}`);
  }

  // 2. Webhook delivery jobs
  for (const [url, event] of [
    ['https://hooks.example.com/payments', 'payment.captured'],
    ['https://hooks.example.com/crm',      'contact.updated'],
  ]) {
    const res: any = await post('/jobs', {
      type: 'webhook_delivery',
      payload: { url, method: 'POST', body: { event, ts: Date.now() } },
      priority: 2,
    });
    console.log(`Created webhook_delivery → ${res.data.id}`);
  }

  // 3. Log processing jobs
  for (const [source, level, message] of [
    ['api-gateway', 'info',  'Batch request processed'],
    ['worker',      'warn',  'High memory usage detected'],
    ['scheduler',   'error', 'Sweep exceeded time budget'],
  ] as [string, string, string][]) {
    const res: any = await post('/jobs', {
      type: 'log_processing',
      payload: { source, level, message },
      priority: 3,
    });
    console.log(`Created log_processing [${level}] → ${res.data.id}`);
  }

  // 4. Scheduled job (runs in 2 minutes)
  const scheduledAt = new Date(Date.now() + 2 * 60_000).toISOString();
  const scheduled: any = await post('/jobs', {
    type: 'send_email',
    payload: { to: 'scheduled@example.com', subject: 'Scheduled delivery' },
    priority: 2,
    scheduled_at: scheduledAt,
  });
  console.log(`Created scheduled send_email (runs at ${scheduledAt}) → ${scheduled.data.id}`);

  // 5. Recurring job — every_1_minute
  const recurring: any = await post('/jobs', {
    type: 'log_processing',
    payload: { source: 'heartbeat', level: 'info', message: 'System alive' },
    priority: 3,
    recurring_interval: 'every_1_minute',
  });
  console.log(`Created recurring log_processing (every_1_minute) → ${recurring.data.id}`);

  // 6. DAG chain: A → B → C
  const jobA: any = await post('/jobs', {
    type: 'log_processing',
    payload: { source: 'report-gen', level: 'info', message: 'Generate report' },
    priority: 1,
  });
  const jobB: any = await post('/jobs', {
    type: 'webhook_delivery',
    payload: { url: 'https://storage.example.com/upload', method: 'POST', body: { file: 'report.pdf' } },
    priority: 1,
    depends_on: [jobA.data.id],
  });
  const jobC: any = await post('/jobs', {
    type: 'send_email',
    payload: { to: 'manager@example.com', subject: 'Report ready' },
    priority: 1,
    depends_on: [jobB.data.id],
  });
  console.log(`\nDAG chain created:`);
  console.log(`  A (generate report)  → ${jobA.data.id}`);
  console.log(`  B (upload file)      → ${jobB.data.id}  [depends_on A]`);
  console.log(`  C (send email)       → ${jobC.data.id}  [depends_on B]`);

  console.log('\nAll jobs created. Watch the UI for live SSE updates.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
