import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { env } from '@config/env';

const JOB_EVENT_CHANNEL = 'job_event';
const SSE_REDIS_CHANNEL = 'scheduler:sse:events';

interface JobEvent {
  event: string;
  data: Record<string, unknown>;
}

function makeRedisOpts() {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
    ...(env.REDIS_USERNAME && { username: env.REDIS_USERNAME }),
    ...(env.REDIS_TLS && { tls: {} as object }),
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 200, 2_000),
  };
}

@Injectable()
export class SseService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis | undefined;
  private subscriber: Redis | undefined;
  private readonly logger = new Logger(SseService.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async onModuleInit(): Promise<void> {
    const opts = makeRedisOpts();
    this.publisher = new Redis(opts);
    this.subscriber = new Redis(opts);

    // Attach before connecting so no messages are missed between connect and subscribe.
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const payload = JSON.parse(raw) as JobEvent;
        this.emitter.emit(JOB_EVENT_CHANNEL, payload);
      } catch {
        this.logger.error({ event: 'sse_bridge_parse_error', raw });
      }
    });

    await this.publisher.connect();
    await this.subscriber.connect();
    await this.subscriber.subscribe(SSE_REDIS_CHANNEL);

    this.logger.log({ event: 'sse_bridge_ready', channel: SSE_REDIS_CHANNEL });
  }

  emit(event: string, data: Record<string, unknown>): void {
    const payload: JobEvent = { event, data };

    if (this.publisher) {
      this.publisher.publish(SSE_REDIS_CHANNEL, JSON.stringify(payload)).catch((err: Error) => {
        this.logger.error({ event: 'sse_bridge_publish_failed', error: err.message });
        // Fallback: emit locally so API SSE clients still receive the event.
        this.emitter.emit(JOB_EVENT_CHANNEL, payload);
      });
    } else {
      // No Redis connection (unit tests or pre-init) — emit directly.
      this.emitter.emit(JOB_EVENT_CHANNEL, payload);
    }
  }

  stream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const handler = (payload: JobEvent) => {
        subscriber.next({ type: payload.event, data: payload.data });
      };

      this.emitter.on(JOB_EVENT_CHANNEL, handler);

      return () => this.emitter.off(JOB_EVENT_CHANNEL, handler);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }
}
