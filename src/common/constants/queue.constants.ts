export const QUEUES = {
  JOBS: 'jobs',
} as const;

export const JOBS = {
  PROCESS_JOB: 'process-job',
} as const;

export const JOB_RETENTION = {
  COMPLETED_MS: 1000 * 60 * 60 * 24, // 24 h
  FAILED_MS: 1000 * 60 * 60 * 24 * 7, // 7 days
} as const;

// Redis key prefix and TTL for the distributed worker lock.
// TTL must exceed the longest expected job processing time.
export const WORKER_LOCK = {
  KEY_PREFIX: 'job:lock:',
  TTL_SECONDS: 60,
} as const;
