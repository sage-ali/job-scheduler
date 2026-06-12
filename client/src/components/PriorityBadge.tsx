import type { JobPriority } from '../api/jobs';

const labels: Record<JobPriority, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };
const colours: Record<JobPriority, string> = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-green-100 text-green-800',
};

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colours[priority]}`}>
      {labels[priority]}
    </span>
  );
}
