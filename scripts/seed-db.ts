/**
 * Seed script — inserts jobs and DLQ entries directly into the DB.
 * Bypasses the API and worker so you get all statuses populated instantly.
 *
 * Usage:  pnpm seed:db
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'job_scheduler',
  entities: [__dirname + '/../src/**/*.entity.{ts,js}'],
  synchronize: false,
});

function ago(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function future(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

const base = {
  retry_count: 0,
  max_retries: 3,
  error_message: null,
  recurring_interval: null,
  depends_on: null,
  next_run_at: null,
  scheduled_at: null,
  started_at: null,
  completed_at: null,
};

async function main() {
  await ds.initialize();
  console.log('Connected to DB');

  const jobRepo = ds.getRepository('jobs');
  const dlqRepo = ds.getRepository('dlq_jobs');

  // ── Recurring every-1-minute jobs ─────────────────────────────────────────
  // next_run_at = null → scheduler sweep picks them up immediately on first run
  // After each completion the worker sets next_run_at = now + 60s, so a fresh
  // wave fires every minute — good for watching the UI update in real time.
  const recurringEmails = [
    'metrics@example.com',
    'heartbeat@example.com',
    'digest@example.com',
    'alerts@example.com',
    'audit@example.com',
    'report@example.com',
    'sync@example.com',
    'notify@example.com',
    'summary@example.com',
    'ping@example.com',
  ].map((to) => ({
    ...base,
    type: 'send_email',
    payload: { to, subject: `[Recurring] ${to.split('@')[0]}` },
    priority: 2,
    priority_score: 2,
    status: 'pending',
    recurring_interval: 'every_1_minute',
  }));

  // Two recurring webhook deliveries — different priority to demonstrate scheduling order
  const recurringWebhooks = [
    { url: 'https://hooks.example.com/monitor', priority: 1 },
    { url: 'https://hooks.example.com/analytics', priority: 3 },
  ].map(({ url, priority }) => ({
    ...base,
    type: 'webhook_delivery',
    payload: { url, method: 'POST', body: { event: 'heartbeat', ts: new Date().toISOString() } },
    priority,
    priority_score: priority,
    status: 'pending',
    recurring_interval: 'every_1_minute',
  }));

  // ── Jobs scheduled to become runnable in 1–4 minutes ──────────────────────
  // These sit as pending-with-scheduled_at until the scheduler sweep sees their
  // scheduled_at <= now, then enqueues them. Watch the pending count drop as
  // each minute passes.
  const scheduledSoon = [
    { to: 'release-1min@example.com', minutesOut: 1, subject: 'Release in 1 min' },
    { to: 'release-2min@example.com', minutesOut: 2, subject: 'Release in 2 min' },
    { to: 'release-3min@example.com', minutesOut: 3, subject: 'Release in 3 min' },
    { to: 'release-4min@example.com', minutesOut: 4, subject: 'Release in 4 min' },
  ].map(({ to, minutesOut, subject }) => ({
    ...base,
    type: 'send_email',
    payload: { to, subject },
    priority: 1,
    priority_score: 1,
    status: 'pending',
    scheduled_at: future(minutesOut),
  }));

  // ── Immediately runnable one-off jobs ──────────────────────────────────────
  // Should be picked up within seconds of the worker starting.
  const immediateJobs = [
    { type: 'send_email', payload: { to: 'welcome@example.com', subject: 'Welcome!' }, priority: 1 },
    { type: 'send_email', payload: { to: 'promo@example.com', subject: 'Special Offer' }, priority: 3 },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/payments', method: 'POST', body: { event: 'payment.success', amount: 49 } }, priority: 1 },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/crm', method: 'POST', body: { event: 'user.signup', userId: 'u_001' } }, priority: 2 },
    { type: 'log_processing', payload: { source: 'api-gateway', level: 'info', message: 'POST /api/v1/jobs 201' }, priority: 3 },
    { type: 'log_processing', payload: { source: 'scheduler', level: 'warn', message: 'Sweep took longer than expected' }, priority: 2 },
  ].map((j) => ({ ...base, ...j, priority_score: j.priority, status: 'pending' }));

  // ── DAG chain: B and C both depend on A ────────────────────────────────────
  // A is immediately pending. B and C won't be enqueued until A completes.
  // Demonstrates the dependency-check path in the worker.
  const dagAId = randomUUID();
  const dagBId = randomUUID();
  const dagCId = randomUUID();

  const dagJobs = [
    { id: dagAId, type: 'send_email', payload: { to: 'dag-step-a@example.com', subject: 'DAG Step A (no deps)' }, priority: 1, priority_score: 1, status: 'pending', depends_on: null },
    { id: dagBId, type: 'send_email', payload: { to: 'dag-step-b@example.com', subject: 'DAG Step B (waits for A)' }, priority: 1, priority_score: 1, status: 'pending', depends_on: [dagAId] },
    { id: dagCId, type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/dag', method: 'POST', body: { step: 'C', after: dagAId } }, priority: 2, priority_score: 2, status: 'pending', depends_on: [dagAId] },
  ].map((j) => ({ ...base, ...j }));

  // ── Historical data for stats cards ───────────────────────────────────────
  const history = [
    // Completed
    { type: 'send_email', payload: { to: 'alice@example.com', subject: 'Order Confirmation' }, priority: 1, priority_score: 1, status: 'completed', started_at: ago(60), completed_at: ago(59) },
    { type: 'send_email', payload: { to: 'bob@example.com', subject: 'Monthly Report' }, priority: 2, priority_score: 2, status: 'completed', retry_count: 1, started_at: ago(45), completed_at: ago(44) },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/old', method: 'POST', body: { event: 'signup' } }, priority: 1, priority_score: 1, status: 'completed', started_at: ago(30), completed_at: ago(29) },
    { type: 'log_processing', payload: { source: 'api-gateway', level: 'info', message: 'GET /api/v1/jobs 200' }, priority: 3, priority_score: 3, status: 'completed', started_at: ago(20), completed_at: ago(19) },
    { type: 'log_processing', payload: { source: 'worker', level: 'info', message: 'Job completed' }, priority: 3, priority_score: 3, status: 'completed', started_at: ago(10), completed_at: ago(9) },
    { type: 'send_email', payload: { to: 'carol@example.com', subject: 'Welcome Back' }, priority: 2, priority_score: 2, status: 'completed', started_at: ago(5), completed_at: ago(4) },

    // Failed — will produce DLQ entries
    { type: 'send_email', payload: { to: 'charlie@example.com', subject: 'Invoice' }, priority: 1, priority_score: 1, status: 'failed', retry_count: 3, started_at: ago(90), error_message: 'Simulated email delivery failure to c*****e@example.com' },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/legacy', method: 'POST', body: {} }, priority: 2, priority_score: 2, status: 'failed', retry_count: 3, started_at: ago(75), error_message: 'Simulated webhook timeout: POST https://hooks.example.com/legacy' },
    { type: 'log_processing', payload: { source: 'payment-service', level: 'error', message: 'Transaction rollback' }, priority: 1, priority_score: 1, status: 'failed', retry_count: 3, started_at: ago(50), error_message: 'Simulated log ingest failure: payment-service' },

    // Cancelled
    { type: 'send_email', payload: { to: 'dave@example.com', subject: 'Promo' }, priority: 3, priority_score: 3, status: 'cancelled' },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/deprecated', method: 'POST' }, priority: 2, priority_score: 2, status: 'cancelled' },
  ].map((j) => ({ ...base, ...j }));

  const allJobs = [
    ...recurringEmails,
    ...recurringWebhooks,
    ...scheduledSoon,
    ...immediateJobs,
    ...history,
  ].map((j) => jobRepo.create({ id: randomUUID(), ...j, created_at: ago(Math.floor(Math.random() * 120)), updated_at: new Date() }));

  // DAG jobs need specific IDs
  const allDagJobs = dagJobs.map((j) => jobRepo.create({ ...j, created_at: ago(1), updated_at: new Date() }));

  const savedJobs = await jobRepo.save([...allJobs, ...allDagJobs]);
  console.log(`Inserted ${savedJobs.length} jobs`);

  // ── DLQ entries for failed jobs ────────────────────────────────────────────
  const failedJobs = savedJobs.filter((j: any) => j.status === 'failed');
  const dlqEntries = failedJobs.map((j: any) =>
    dlqRepo.create({
      id: randomUUID(),
      original_job_id: j.id,
      type: j.type,
      payload: j.payload,
      priority: j.priority,
      error_message: j.error_message,
      retry_count: j.retry_count,
      last_attempted_at: ago(Math.floor(Math.random() * 60)),
      created_at: new Date(),
      updated_at: new Date(),
    }),
  );

  const savedDlq = await dlqRepo.save(dlqEntries);
  console.log(`Inserted ${savedDlq.length} DLQ entries`);

  await ds.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
