// Generic HTTP
export const HTTP_INTERNAL_SERVER_ERROR = 'An unexpected error occurred. Please try again later.';
export const HTTP_INTERNAL_SERVER_ERROR_NAME = 'Internal Server Error';
export const VALIDATION_FAILED = 'Validation failed';

// Redis
export const REDIS_CONNECTION_ESTABLISHED = 'Redis connection established';
export const REDIS_CLIENT_READY = 'Redis client ready';
export const REDIS_CONNECTION_CLOSED = 'Redis connection closed';
export const REDIS_CLIENT_ERROR = 'Redis client error';
export const REDIS_CRITICAL_OOM = 'Redis OOM — server is out of memory';
export const REDIS_INITIAL_CONNECTION_FAILED = 'Redis initial connection failed';
export const REDIS_RETRY_LIMIT_REACHED = 'Redis retry limit reached — giving up';
export const REDIS_RECONNECT_ATTEMPT = (times: number, delay: number) =>
  `Redis reconnect attempt ${times}, next retry in ${delay}ms`;
export const REDIS_PATTERN_DELETE_SUCCESS = (count: number, pattern: string) =>
  `Deleted ${count} Redis keys matching pattern "${pattern}"`;

// Jobs
export const JOB_NOT_FOUND = (id: string) => `Job ${id} not found`;
export const JOB_CREATED = 'Job created successfully';
export const JOB_LIST_FETCHED = 'Jobs retrieved successfully';
export const JOB_FETCHED = 'Job retrieved successfully';
export const JOB_STATS_FETCHED = 'Dashboard statistics retrieved successfully';
export const JOB_CANCELLED_SUCCESS = 'Job cancelled successfully';
export const JOB_ALREADY_PROCESSING = 'Job is already being processed and cannot be modified';
export const JOB_CANNOT_BE_CANCELLED = (status: string) =>
  `Job with status "${status}" cannot be cancelled`;
export const JOB_DEPENDENCY_NOT_MET = (depId: string) =>
  `Dependency job ${depId} has not completed successfully`;

// Benchmark
export const BENCHMARK_COMPLETE = 'Benchmark complete';

// DLQ
export const DLQ_JOB_NOT_FOUND = (id: string) => `DLQ job ${id} not found`;
export const DLQ_LIST_FETCHED = 'DLQ jobs retrieved successfully';
export const DLQ_RETRY_QUEUED = 'Job re-queued from DLQ for retry';
export const DLQ_THRESHOLD_EXCEEDED = (count: number, threshold: number) =>
  `DLQ alert: ${count} jobs have failed (threshold: ${threshold})`;
