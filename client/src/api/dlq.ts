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

export async function fetchDlqJobs(): Promise<DlqJob[]> {
  const res = await client.get<{ data: DlqJob[] }>('/dlq');
  return res.data.data;
}

export async function retryDlqJob(id: string): Promise<{ jobId: string }> {
  const res = await client.post<{ data: { jobId: string } }>(`/dlq/${id}/retry`);
  return res.data.data;
}
