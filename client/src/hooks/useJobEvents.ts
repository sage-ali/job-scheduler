import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useJobEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource('/api/v1/jobs/events');

    const invalidate = (...keys: string[][]) =>
      keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));

    es.addEventListener('job_created', () => invalidate(['jobs'], ['stats']));
    es.addEventListener('job_started', () => invalidate(['jobs'], ['stats']));
    es.addEventListener('job_completed', () => invalidate(['jobs'], ['stats']));
    es.addEventListener('job_failed', () => invalidate(['jobs'], ['stats'], ['dlq']));
    es.addEventListener('job_cancelled', () => invalidate(['jobs'], ['stats']));
    es.addEventListener('dlq_added', () => invalidate(['dlq'], ['stats']));

    es.onerror = () => es.close();

    return () => es.close();
  }, [queryClient]);
}
