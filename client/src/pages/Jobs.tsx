import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  fetchJobs,
  cancelJob,
  type Job,
  type JobStatus,
  type JobType,
  type JobPriority,
  type ListJobsParams,
} from '../api/jobs';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

function fmt(iso: string | null): string {
  if (!iso) return '—';
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

// Returns the page numbers to render, with null as an ellipsis marker.
function pageWindows(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | null)[] = [1];

  if (current > 3) pages.push(null);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);

  if (current < total - 2) pages.push(null);

  pages.push(total);
  return pages;
}

function JobRow({ job, onCancel }: { job: Job; onCancel: (id: string) => void }) {
  return (
    <tr className="border-t hover:bg-gray-50 text-sm">
      <td className="px-4 py-3 font-mono text-xs text-gray-500" title={job.id}>
        {truncate(job.id)}
      </td>
      <td className="px-4 py-3 text-gray-700">{job.type}</td>
      <td className="px-4 py-3"><PriorityBadge priority={job.priority} /></td>
      <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
      <td className="px-4 py-3 text-center text-gray-600">{job.retry_count}/{job.max_retries}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(job.scheduled_at)}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{job.recurring_interval ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(job.created_at)}</td>
      <td className="px-4 py-3">
        {job.status === 'pending' && (
          <button
            onClick={() => onCancel(job.id)}
            className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 border border-red-200"
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}

export function Jobs() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ListJobsParams>({ page: 1, limit: 20 });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => fetchJobs(filters),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const setFilter = (key: keyof ListJobsParams, value: string | number | undefined) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  const goTo = (p: number) => setFilters((f) => ({ ...f, page: p }));

  const jobs = data?.data ?? [];
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const limit = filters.limit ?? 20;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
        <Link
          to="/jobs/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Create Job
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {(['pending', 'processing', 'completed', 'failed', 'cancelled'] as JobStatus[]).map(
            (s) => <option key={s} value={s}>{s}</option>
          )}
        </select>

        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All types</option>
          {(['send_email', 'webhook_delivery', 'log_processing'] as JobType[]).map(
            (t) => <option key={t} value={t}>{t}</option>
          )}
        </select>

        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          onChange={(e) => {
            const v = e.target.value;
            setFilters((f) => ({ ...f, priority: v ? (Number(v) as JobPriority) : undefined, page: 1 }));
          }}
        >
          <option value="">All priorities</option>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
        </select>

        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 ml-auto"
          value={limit}
          onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}
        >
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>

      {isLoading && <p className="text-gray-500">Loading jobs…</p>}
      {isError && <p className="text-red-600">Failed to load jobs.</p>}

      {!isLoading && (
        <>
          {/* Row count */}
          {total > 0 && (
            <p className="text-xs text-gray-500 mb-2">
              Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()} jobs
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-center">Retries</th>
                  <th className="px-4 py-3 text-left">Scheduled At</th>
                  <th className="px-4 py-3 text-left">Interval</th>
                  <th className="px-4 py-3 text-left">Created At</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      No jobs found.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onCancel={(id) => cancelMutation.mutate(id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages.toLocaleString()}
              </p>

              <div className="flex items-center gap-1">
                <button
                  disabled={!data?.hasPrevious}
                  onClick={() => goTo(page - 1)}
                  className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>

                {pageWindows(page, totalPages).map((p, i) =>
                  p === null ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goTo(p)}
                      className={`rounded border w-9 py-1.5 text-sm ${
                        p === page
                          ? 'bg-indigo-600 border-indigo-600 text-white font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  disabled={!data?.hasNext}
                  onClick={() => goTo(page + 1)}
                  className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
