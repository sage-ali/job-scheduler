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

  // 6. DAG chain 1: Generate report → Upload file → Notify manager
  const dagA: any = await post('/jobs', {
    type: 'log_processing',
    payload: { source: 'report-gen', level: 'info', message: 'Generate monthly report' },
    priority: 1,
  });
  const dagB: any = await post('/jobs', {
    type: 'webhook_delivery',
    payload: { url: 'https://storage.example.com/upload', method: 'POST', body: { file: 'report.pdf' } },
    priority: 1,
    depends_on: [dagA.data.id],
  });
  const dagC: any = await post('/jobs', {
    type: 'send_email',
    payload: { to: 'manager@example.com', subject: 'Monthly report ready' },
    priority: 1,
    depends_on: [dagB.data.id],
  });
  console.log(`\nDAG chain 1 (linear):`);
  console.log(`  ${dagA.data.id.slice(0, 8)}… generate report`);
  console.log(`  ${dagB.data.id.slice(0, 8)}… upload file      [depends_on A]`);
  console.log(`  ${dagC.data.id.slice(0, 8)}… notify manager   [depends_on B]`);

  // 7. DAG chain 2: Fan-in — two parallel jobs must complete before the final step
  const fanA: any = await post('/jobs', {
    type: 'log_processing',
    payload: { source: 'data-pipeline', level: 'info', message: 'Process transactions' },
    priority: 2,
  });
  const fanB: any = await post('/jobs', {
    type: 'log_processing',
    payload: { source: 'data-pipeline', level: 'info', message: 'Validate schema' },
    priority: 2,
  });
  const fanC: any = await post('/jobs', {
    type: 'send_email',
    payload: { to: 'data-team@example.com', subject: 'Pipeline complete' },
    priority: 2,
    depends_on: [fanA.data.id, fanB.data.id],
  });
  console.log(`\nDAG chain 2 (fan-in):`);
  console.log(`  ${fanA.data.id.slice(0, 8)}… process transactions  (parallel)`);
  console.log(`  ${fanB.data.id.slice(0, 8)}… validate schema       (parallel)`);
  console.log(`  ${fanC.data.id.slice(0, 8)}… notify data-team      [depends_on A + B]`);

  console.log('\nAll jobs created. Watch the UI for live SSE updates.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
