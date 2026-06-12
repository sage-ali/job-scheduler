import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStats, fetchQueueStatus, pauseQueue, resumeQueue, type JobStats } from '../api/jobs';

const cards: { key: keyof JobStats; label: string; colour: string }[] = [
  { key: 'pending',    label: 'Pending',    colour: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'processing', label: 'Processing', colour: 'bg-blue-50 border-blue-200 text-blue-800' },
  { key: 'completed',  label: 'Completed',  colour: 'bg-green-50 border-green-200 text-green-800' },
  { key: 'failed',     label: 'Failed',     colour: 'bg-red-50 border-red-200 text-red-800' },
  { key: 'cancelled',  label: 'Cancelled',  colour: 'bg-gray-50 border-gray-200 text-gray-600' },
];

export function Dashboard() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  });

  const { data: queueStatus, isLoading: queueLoading } = useQuery({
    queryKey: ['queue-status'],
    queryFn: fetchQueueStatus,
    refetchInterval: 10_000,
  });

  const pauseMutation = useMutation({
    mutationFn: pauseQueue,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue-status'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: resumeQueue,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue-status'] }),
  });

  const total = stats ? Object.values(stats).reduce((sum, n) => sum + n, 0) : 0;
  const actionPending = pauseMutation.isPending || resumeMutation.isPending;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {statsLoading && <p className="text-gray-500">Loading stats…</p>}
      {statsError && <p className="text-red-600">Failed to load stats.</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-4">
            {cards.map(({ key, label, colour }) => (
              <div key={key} className={`rounded-lg border p-4 ${colour}`}>
                <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
                <p className="mt-1 text-3xl font-bold">{stats[key]}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-white p-4 text-sm text-gray-600 inline-block mb-6">
            <span className="font-medium text-gray-900">Total jobs:</span> {total}
          </div>
        </>
      )}

      <div className="rounded-lg border bg-white p-5 flex items-center gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Queue</p>
          {queueLoading ? (
            <span className="text-sm text-gray-400">Loading…</span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${queueStatus?.paused ? 'text-orange-600' : 'text-green-600'}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${queueStatus?.paused ? 'bg-orange-500' : 'bg-green-500'}`} />
              {queueStatus?.paused ? 'Paused' : 'Active'}
            </span>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">Workers</p>
          <span className="text-sm font-semibold text-gray-900">
            {queueLoading ? '—' : (queueStatus?.workers ?? 0)}
          </span>
        </div>

        <div className="ml-auto">
          {queueStatus?.paused ? (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={actionPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionPending ? 'Resuming…' : 'Resume Queue'}
            </button>
          ) : (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={actionPending}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionPending ? 'Pausing…' : 'Pause Queue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
