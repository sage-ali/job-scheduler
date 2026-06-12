import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDlqJobs, retryDlqJob, type DlqJob } from '../api/dlq';

function fmt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function truncate(id: string): string {
  return id.slice(0, 8) + '…';
}

function pageWindows(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | null)[] = [1];
  if (current > 3) pages.push(null);
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push(null);
  pages.push(total);
  return pages;
}

function DlqRow({
  job,
  onRetry,
  retrying,
}: {
  job: DlqJob;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const errTruncated = job.error_message.length > 80
    ? job.error_message.slice(0, 80) + '…'
    : job.error_message;

  return (
    <tr className="border-t hover:bg-gray-50 text-sm">
      <td className="px-4 py-3 font-mono text-xs text-gray-500" title={job.id}>
        {truncate(job.id)}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500" title={job.original_job_id}>
        {truncate(job.original_job_id)}
      </td>
      <td className="px-4 py-3 text-gray-700">{job.type}</td>
      <td className="px-4 py-3 text-red-700 text-xs max-w-xs" title={job.error_message}>
        {errTruncated}
      </td>
      <td className="px-4 py-3 text-center text-gray-600">{job.retry_count}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(job.last_attempted_at)}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(job.created_at)}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onRetry(job.id)}
          disabled={retrying}
          className="rounded bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </td>
    </tr>
  );
}

export function Dlq() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data: result, isLoading, isError } = useQuery({
    queryKey: ['dlq', page, limit],
    queryFn: () => fetchDlqJobs({ page, limit }),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const jobs = result?.data ?? [];
  const totalPages = result?.totalPages ?? 1;
  const total = result?.total ?? 0;
  const hasNext = result?.hasNext ?? false;
  const hasPrevious = result?.hasPrevious ?? false;

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const retryMutation = useMutation({
    mutationFn: retryDlqJob,
    onMutate: (id) => setRetryingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setRetryingId(null);
      setToast('Retried — new job created.');
      setTimeout(() => setToast(''), 3000);
    },
    onError: () => {
      setRetryingId(null);
      setToast('Retry failed. Try again.');
      setTimeout(() => setToast(''), 3000);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dead-Letter Queue</h1>
        {total > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            {total} {total === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {toast && (
        <div className="mb-4 rounded bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          {toast}
        </div>
      )}

      {isLoading && <p className="text-gray-500">Loading DLQ…</p>}
      {isError && <p className="text-red-600">Failed to load DLQ.</p>}

      {!isLoading && (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">DLQ ID</th>
                  <th className="px-4 py-3 text-left">Original Job</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Error</th>
                  <th className="px-4 py-3 text-center">Retries</th>
                  <th className="px-4 py-3 text-left">Last Attempted</th>
                  <th className="px-4 py-3 text-left">Created At</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      DLQ is empty — no failed jobs.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <DlqRow
                      key={job.id}
                      job={job}
                      onRetry={(id) => retryMutation.mutate(id)}
                      retrying={retryingId === job.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-3">
                <span>
                  Showing {start}–{end} of {total} {total === 1 ? 'entry' : 'entries'}
                </span>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} / page</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!hasPrevious}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  ← Prev
                </button>

                {pageWindows(page, totalPages).map((p, i) =>
                  p === null ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        p === page
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
