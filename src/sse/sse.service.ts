import { Injectable, MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';

const JOB_EVENT_CHANNEL = 'job_event';

interface JobEvent {
  event: string;
  data: Record<string, unknown>;
}

@Injectable()
export class SseService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(event: string, data: Record<string, unknown>): void {
    this.emitter.emit(JOB_EVENT_CHANNEL, { event, data } satisfies JobEvent);
  }

  stream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const handler = (payload: JobEvent) => {
        subscriber.next({ type: payload.event, data: payload.data });
      };

      this.emitter.on(JOB_EVENT_CHANNEL, handler);

      // Teardown — called when the SSE client disconnects
      return () => this.emitter.off(JOB_EVENT_CHANNEL, handler);
    });
  }
}
