import client from './client';

export interface DlqJob {
  id: string;
  original_job_id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  error_message: string;
  retry_count: number;
  last_attempted_at: string;
  created_at: string;
}

export interface PaginatedDlqJobs {
  data: DlqJob[];
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export async function fetchDlqJobs(params: { page?: number; limit?: number } = {}): Promise<PaginatedDlqJobs> {
  const res = await client.get('/dlq', { params });
  const { data, meta } = res.data as {
    data: DlqJob[];
    meta: { page: number; total_pages: number; total: number; limit: number; has_next: boolean; has_previous: boolean };
  };
  return {
    data,
    page: meta.page,
    totalPages: meta.total_pages,
    total: meta.total,
    limit: meta.limit,
    hasNext: meta.has_next,
    hasPrevious: meta.has_previous,
  };
}

export async function retryDlqJob(id: string): Promise<{ jobId: string }> {
  const res = await client.post<{ data: { jobId: string } }>(`/dlq/${id}/retry`);
  return res.data.data;
}
