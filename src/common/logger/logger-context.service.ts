import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId: string | null;
  userId?: string;
  jobId?: string | number;
  queue?: string;
  attempt?: number;
}

@Injectable()
export class LoggerContextService {
  private readonly als = new AsyncLocalStorage<LogContext>();

  async run<T>(context: LogContext, callback: () => T | Promise<T>): Promise<T> {
    return this.als.run(context, async () => {
      return await callback();
    });
  }

  getContext(): LogContext | undefined {
    return this.als.getStore();
  }

  getRequestId(): string | null {
    return this.getContext()?.requestId ?? null;
  }

  setJobContext(jobId: string | number, queue: string, attempt?: number): void {
    const context = this.getContext();
    if (context) {
      context.jobId = jobId;
      context.queue = queue;
      context.attempt = attempt;
    }
  }
}
