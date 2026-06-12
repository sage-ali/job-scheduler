import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJob, fetchJobs, type CreateJobDto, type JobType, type JobPriority, type RecurringInterval } from '../api/jobs';
import { StatusBadge } from '../components/StatusBadge';

const defaultPayloads: Record<JobType, string> = {
  send_email: JSON.stringify({ to: 'user@example.com', subject: 'Hello', body: 'Message body' }, null, 2),
  webhook_delivery: JSON.stringify({ url: 'https://example.com/hook', method: 'POST', body: { event: 'test' } }, null, 2),
  log_processing: JSON.stringify({ source: 'api-gateway', level: 'info', message: 'Request received' }, null, 2),
};

export function CreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<JobType>('send_email');
  const [priority, setPriority] = useState<JobPriority>(2);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [payload, setPayload] = useState(defaultPayloads.send_email);
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState<RecurringInterval | ''>('');
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [payloadError, setPayloadError] = useState('');

  const { data: existingJobs } = useQuery({
    queryKey: ['jobs-picker'],
    queryFn: () => fetchJobs({ page: 1, limit: 100 }),
  });

  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/jobs');
    },
  });

  const handleTypeChange = (t: JobType) => {
    setType(t);
    setPayload(defaultPayloads[t]);
    setPayloadError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPayloadError('');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setPayloadError('Payload must be valid JSON.');
      return;
    }

    const dto: CreateJobDto = {
      type,
      payload: parsed,
      priority,
      ...(scheduledAt && { scheduled_at: new Date(scheduledAt).toISOString() }),
      ...(interval && { recurring_interval: interval }),
      ...(selectedDeps.length > 0 && { depends_on: selectedDeps }),
      max_retries: maxRetries,
    };

    mutation.mutate(dto);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Create Job</h1>

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 shadow-sm space-y-5">
        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as JobType)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="send_email">send_email</option>
            <option value="webhook_delivery">webhook_delivery</option>
            <option value="log_processing">log_processing</option>
          </select>
        </div>

        {/* Priority + Max Retries side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as JobPriority)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={1}>High (1)</option>
              <option value={2}>Medium (2)</option>
              <option value={3}>Low (3)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Retries
              <span className="ml-1 text-gray-400 font-normal">(0 = no retries)</span>
            </label>
            <input
              type="number"
              min={0}
              max={3}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Math.min(3, Math.max(0, Number(e.target.value))))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Payload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payload (JSON)</label>
          <textarea
            value={payload}
            onChange={(e) => { setPayload(e.target.value); setPayloadError(''); }}
            rows={6}
            className={`w-full rounded border px-3 py-2 text-sm font-mono ${payloadError ? 'border-red-400' : 'border-gray-300'}`}
          />
          {payloadError && <p className="mt-1 text-xs text-red-600">{payloadError}</p>}
        </div>

        {/* Scheduled At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Scheduled At <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Recurring Interval */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recurring Interval <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as RecurringInterval | '')}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            <option value="every_1_minute">Every 1 minute</option>
            <option value="every_5_minutes">Every 5 minutes</option>
            <option value="every_1_hour">Every 1 hour</option>
          </select>
        </div>

        {/* Depends On */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Depends On <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          {existingJobs && existingJobs.data.filter((j) => j.status === 'pending' || j.status === 'processing').length > 0 ? (
            <div className="max-h-44 overflow-y-auto rounded border border-gray-300 divide-y text-sm">
              {existingJobs.data.filter((j) => j.status === 'pending' || j.status === 'processing').map((job) => (
                <label
                  key={job.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedDeps.includes(job.id)}
                    onChange={() =>
                      setSelectedDeps((prev) =>
                        prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id],
                      )
                    }
                  />
                  <span className="font-mono text-xs text-gray-400">{job.id.slice(0, 8)}…</span>
                  <span className="flex-1 truncate text-gray-700">{job.type}</span>
                  <StatusBadge status={job.status} />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-2">No existing jobs to depend on.</p>
          )}
          {selectedDeps.length > 0 && (
            <p className="mt-1 text-xs text-indigo-600">{selectedDeps.length} job(s) selected</p>
          )}
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">Failed to create job. Check the payload and try again.</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create Job'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="rounded border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
