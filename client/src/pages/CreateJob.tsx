import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJob, type CreateJobDto, type JobType, type JobPriority, type RecurringInterval } from '../api/jobs';

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
  const [payload, setPayload] = useState(defaultPayloads.send_email);
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState<RecurringInterval | ''>('');
  const [dependsOn, setDependsOn] = useState('');
  const [payloadError, setPayloadError] = useState('');

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
      ...(dependsOn.trim() && {
        depends_on: dependsOn.split(',').map((s) => s.trim()).filter(Boolean),
      }),
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

        {/* Priority */}
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
            Depends On <span className="text-gray-400 font-normal">(optional — comma-separated job IDs)</span>
          </label>
          <input
            type="text"
            value={dependsOn}
            onChange={(e) => setDependsOn(e.target.value)}
            placeholder="uuid-1, uuid-2"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
          />
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
