import { useQuery } from '@tanstack/react-query';
import { fetchStats, type JobStats } from '../api/jobs';

const cards: { key: keyof JobStats; label: string; colour: string }[] = [
  { key: 'pending',    label: 'Pending',    colour: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { key: 'processing', label: 'Processing', colour: 'bg-blue-50 border-blue-200 text-blue-800' },
  { key: 'completed',  label: 'Completed',  colour: 'bg-green-50 border-green-200 text-green-800' },
  { key: 'failed',     label: 'Failed',     colour: 'bg-red-50 border-red-200 text-red-800' },
  { key: 'cancelled',  label: 'Cancelled',  colour: 'bg-gray-50 border-gray-200 text-gray-600' },
];

export function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30_000,
  });

  const total = stats
    ? Object.values(stats).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {isLoading && <p className="text-gray-500">Loading stats…</p>}
      {isError && <p className="text-red-600">Failed to load stats.</p>}

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

          <div className="rounded-lg border bg-white p-4 text-sm text-gray-600 inline-block">
            <span className="font-medium text-gray-900">Total jobs:</span> {total}
          </div>
        </>
      )}
    </div>
  );
}
