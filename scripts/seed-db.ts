/**
 * Seed script — inserts jobs and DLQ entries directly into the DB.
 * Bypasses the API and worker so you get all statuses populated instantly.
 *
 * Usage:  npx ts-node -r tsconfig-paths/register scripts/seed-db.ts
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

async function main() {
  await ds.initialize();
  console.log('Connected to DB');

  const jobRepo = ds.getRepository('jobs');
  const dlqRepo = ds.getRepository('dlq_jobs');

  // --- JOBS ---
  const jobs = [
    // Completed — send_email, various priorities
    { type: 'send_email', payload: { to: 'alice@example.com', subject: 'Welcome' }, priority: 1, priority_score: 1, status: 'completed', retry_count: 0, max_retries: 3, started_at: ago(60), completed_at: ago(59), scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'send_email', payload: { to: 'bob@example.com', subject: 'Monthly Report' }, priority: 2, priority_score: 2, status: 'completed', retry_count: 1, max_retries: 3, started_at: ago(45), completed_at: ago(44), scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/payments', method: 'POST', body: { event: 'payment.success', amount: 99 } }, priority: 1, priority_score: 1, status: 'completed', retry_count: 0, max_retries: 3, started_at: ago(30), completed_at: ago(29), scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'log_processing', payload: { source: 'api-gateway', level: 'info', message: 'POST /api/v1/jobs 201' }, priority: 3, priority_score: 3, status: 'completed', retry_count: 0, max_retries: 3, started_at: ago(20), completed_at: ago(19), scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'log_processing', payload: { source: 'worker', level: 'info', message: 'Job completed successfully' }, priority: 3, priority_score: 3, status: 'completed', retry_count: 0, max_retries: 3, started_at: ago(10), completed_at: ago(9), scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },

    // Failed — will get DLQ entries
    { type: 'send_email', payload: { to: 'charlie@example.com', subject: 'Invoice' }, priority: 1, priority_score: 1, status: 'failed', retry_count: 3, max_retries: 3, started_at: ago(90), completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: 'Simulated email delivery failure to c*****e@example.com', next_run_at: null },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/crm', method: 'POST', body: { event: 'user.signup' } }, priority: 2, priority_score: 2, status: 'failed', retry_count: 3, max_retries: 3, started_at: ago(75), completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: 'Simulated webhook timeout: POST https://hooks.example.com/crm', next_run_at: null },
    { type: 'log_processing', payload: { source: 'payment-service', level: 'error', message: 'Transaction rollback' }, priority: 1, priority_score: 1, status: 'failed', retry_count: 3, max_retries: 3, started_at: ago(50), completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: 'Simulated log ingest failure from source: payment-service', next_run_at: null },

    // Cancelled
    { type: 'send_email', payload: { to: 'dave@example.com', subject: 'Promo' }, priority: 3, priority_score: 3, status: 'cancelled', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/old', method: 'POST' }, priority: 2, priority_score: 2, status: 'cancelled', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },

    // Pending — immediately runnable
    { type: 'send_email', payload: { to: 'eve@example.com', subject: 'Password Reset' }, priority: 1, priority_score: 1, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/analytics', method: 'POST', body: { event: 'page_view', path: '/dashboard' } }, priority: 2, priority_score: 2, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'log_processing', payload: { source: 'scheduler', level: 'warn', message: 'Sweep took longer than expected' }, priority: 3, priority_score: 3, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },

    // Pending — scheduled in future
    { type: 'send_email', payload: { to: 'frank@example.com', subject: 'Weekly Digest' }, priority: 2, priority_score: 2, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: future(30), recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
    { type: 'webhook_delivery', payload: { url: 'https://hooks.example.com/billing', method: 'POST', body: { event: 'billing.reminder' } }, priority: 1, priority_score: 1, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: future(120), recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },

    // Pending — recurring
    { type: 'log_processing', payload: { source: 'health-check', level: 'info', message: 'All systems operational' }, priority: 3, priority_score: 3, status: 'pending', retry_count: 0, max_retries: 3, started_at: null, completed_at: null, scheduled_at: null, recurring_interval: 'every_5_minutes', depends_on: null, error_message: null, next_run_at: null },

    // Processing (simulate an in-flight job)
    { type: 'send_email', payload: { to: 'grace@example.com', subject: 'Order Confirmation' }, priority: 1, priority_score: 1, status: 'processing', retry_count: 0, max_retries: 3, started_at: ago(1), completed_at: null, scheduled_at: null, recurring_interval: null, depends_on: null, error_message: null, next_run_at: null },
  ];

  const savedJobs = await jobRepo.save(jobs.map((j) => jobRepo.create({ id: randomUUID(), ...j, created_at: ago(Math.floor(Math.random() * 120)), updated_at: new Date() })));
  console.log(`Inserted ${savedJobs.length} jobs`);

  // --- DLQ entries for the 3 failed jobs ---
  const failedJobs = savedJobs.filter((j: any) => j.status === 'failed');
  const dlqEntries = failedJobs.map((j: any) => dlqRepo.create({
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
  }));

  const savedDlq = await dlqRepo.save(dlqEntries);
  console.log(`Inserted ${savedDlq.length} DLQ entries`);

  await ds.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
