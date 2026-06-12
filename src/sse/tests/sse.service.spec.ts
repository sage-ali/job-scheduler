import { EventEmitter2 } from '@nestjs/event-emitter';
import { SseService } from '../sse.service';

function makeService() {
  const emitter = new EventEmitter2();
  const service = new SseService(emitter);
  return { service, emitter };
}

describe('SseService', () => {
  describe('emit()', () => {
    it('publishes to the job_event channel with event name and data', (done) => {
      const { service, emitter } = makeService();

      emitter.once('job_event', (payload: unknown) => {
        expect(payload).toEqual({
          event: 'job_created',
          data: { id: 'abc', status: 'pending' },
        });
        done();
      });

      service.emit('job_created', { id: 'abc', status: 'pending' });
    });
  });

  describe('stream()', () => {
    it('emits a MessageEvent for each published event', (done) => {
      const { service } = makeService();
      const received: unknown[] = [];

      const sub = service.stream().subscribe((msg) => {
        received.push(msg);
        if (received.length === 2) {
          expect(received).toEqual([
            { type: 'job_started', data: { id: '1', status: 'processing' } },
            { type: 'job_completed', data: { id: '1', status: 'completed' } },
          ]);
          sub.unsubscribe();
          done();
        }
      });

      service.emit('job_started', { id: '1', status: 'processing' });
      service.emit('job_completed', { id: '1', status: 'completed' });
    });

    it('removes the listener when the subscriber unsubscribes', () => {
      const { service, emitter } = makeService();

      const sub = service.stream().subscribe(() => {});
      expect(emitter.listenerCount('job_event')).toBe(1);

      sub.unsubscribe();
      expect(emitter.listenerCount('job_event')).toBe(0);
    });

    it('multiple subscribers each receive the same event independently', (done) => {
      const { service } = makeService();
      const results: string[] = [];

      const sub1 = service.stream().subscribe((msg) => results.push(`A:${msg.type}`));
      const sub2 = service.stream().subscribe((msg) => results.push(`B:${msg.type}`));

      service.emit('job_failed', { id: '2', status: 'failed', error: 'timeout' });

      // Allow microtask queue to flush
      setImmediate(() => {
        expect(results).toEqual(expect.arrayContaining(['A:job_failed', 'B:job_failed']));
        sub1.unsubscribe();
        sub2.unsubscribe();
        done();
      });
    });
  });
});
