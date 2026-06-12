import type { JobStatus } from '../api/jobs';

const colours: Record<JobStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colours[status]}`}>
      {status}
    </span>
  );
}
