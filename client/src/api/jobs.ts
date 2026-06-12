import client from './client';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type JobType = 'send_email' | 'webhook_delivery' | 'log_processing';
export type JobPriority = 1 | 2 | 3;
export type RecurringInterval = 'every_1_minute' | 'every_5_minutes' | 'every_1_hour';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  priority: JobPriority;
  status: JobStatus;
  retry_count: number;
  max_retries: number;
  scheduled_at: string | null;
  recurring_interval: RecurringInterval | null;
  depends_on: string[] | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface PaginatedJobs {
  data: Job[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

export interface CreateJobDto {
  type: JobType;
  payload: Record<string, unknown>;
  priority?: JobPriority;
  scheduled_at?: string;
  recurring_interval?: RecurringInterval;
  depends_on?: string[];
}

export interface QueueStatus {
  paused: boolean;
  workers: number;
}

export interface ListJobsParams {
  status?: JobStatus;
  type?: JobType;
  priority?: JobPriority;
  page?: number;
  limit?: number;
}

export async function fetchStats(): Promise<JobStats> {
  const res = await client.get<{ data: JobStats }>('/jobs/stats');
  return res.data.data;
}

export async function fetchJobs(params: ListJobsParams = {}): Promise<PaginatedJobs> {
  const res = await client.get('/jobs', { params });
  const { data, currentPage, totalPages, totalItems, itemsPerPage } = res.data;
  return { data, currentPage, totalPages, totalItems, itemsPerPage };
}

export async function createJob(dto: CreateJobDto): Promise<Job> {
  const res = await client.post<{ data: Job }>('/jobs', dto);
  return res.data.data;
}

export async function cancelJob(id: string): Promise<Job> {
  const res = await client.patch<{ data: Job }>(`/jobs/${id}/cancel`);
  return res.data.data;
}

export async function fetchQueueStatus(): Promise<QueueStatus> {
  const res = await client.get<{ data: QueueStatus }>('/jobs/queue/status');
  return res.data.data;
}

export async function pauseQueue(): Promise<void> {
  await client.post('/jobs/queue/pause');
}

export async function resumeQueue(): Promise<void> {
  await client.post('/jobs/queue/resume');
}
