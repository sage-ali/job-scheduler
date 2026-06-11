import { Injectable, LoggerService } from '@nestjs/common';
import { logger, logLevel } from './pino.logger';
import { LoggerContextService } from './logger-context.service';
import { maskId, maskEmail } from './pii';

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger = logger;
  private readonly logLevel = logLevel;

  constructor(private readonly contextService: LoggerContextService) {}

  getLoggerLevel(): string {
    return this.logLevel;
  }

  runWithContext(
    context: Partial<{
      requestId: string | null;
      userId?: string;
      jobId?: string | number;
      queue?: string;
      attempt?: number;
    }>,
    callback: () => void | Promise<void>,
  ): Promise<void> {
    const existingContext = this.contextService.getContext() ?? {};
    const mergedContext = { requestId: null, ...existingContext, ...context };

    return this.contextService.run(mergedContext, async () => {
      await callback();
    });
  }

  private resolveEvent(message: unknown): {
    event: string;
    data: Record<string, unknown>;
  } {
    if (message instanceof Error) {
      return { event: message.message, data: { stack: message.stack } };
    }
    if (Array.isArray(message)) {
      return { event: 'unknown', data: { raw: message } };
    }
    if (typeof message === 'object' && message !== null) {
      const obj = message as Record<string, unknown>;
      const event =
        typeof obj['event'] === 'string'
          ? obj['event']
          : typeof obj['message'] === 'string'
            ? obj['message']
            : 'unknown';
      const rest = Object.fromEntries(
        Object.entries(obj).filter(([k]) => k !== 'event' && k !== 'message'),
      ) as Record<string, unknown>;
      return { event, data: rest };
    }
    return { event: String(message), data: {} };
  }

  private getContextFields(): Record<string, unknown> {
    const context = this.contextService.getContext();
    if (!context) return {};

    const fields: Record<string, unknown> = {};
    if (context.requestId !== undefined) fields.requestId = context.requestId;
    if (context.jobId !== undefined) fields.jobId = context.jobId;
    if (context.queue) fields.queue = context.queue;
    if (context.attempt !== undefined) fields.attempt = context.attempt;
    if (context.userId) fields.userId = maskId(context.userId, 'usr');
    return fields;
  }

  private buildPayload(
    event: string,
    data?: Record<string, unknown> | string,
    err?: Error,
    nestContext?: string,
  ): Record<string, unknown> {
    const fields = this.getContextFields();

    if (data instanceof Error) {
      const payload: Record<string, unknown> = {
        event,
        ...fields,
        error: data.message,
        stack: data.stack,
      };
      if (nestContext) payload['nestContext'] = nestContext;
      return payload;
    }

    const maskedData: Record<string, unknown> =
      typeof data === 'object' && data !== null
        ? { ...data }
        : typeof data === 'string'
          ? { stack: data }
          : {};

    if (maskedData.email && typeof maskedData.email === 'string') {
      maskedData.email = maskEmail(maskedData.email);
    }

    if (err instanceof Error) {
      maskedData.error = err.message;
      maskedData.stack = err.stack;
    } else if (maskedData.error instanceof Error) {
      maskedData.stack = (maskedData.error as Error).stack;
      maskedData.error = (maskedData.error as Error).message;
    }

    const payload: Record<string, unknown> = { event, ...fields, ...maskedData };
    if (nestContext) payload['nestContext'] = nestContext;
    return payload;
  }

  info(event: string, data?: Record<string, unknown>): void {
    if (typeof event !== 'string') {
      const { event: ev, data: d } = this.resolveEvent(event);
      this.logger.info(this.buildPayload(ev, d));
      return;
    }
    this.logger.info(this.buildPayload(event, data));
  }

  warn(event: string, data?: Record<string, unknown>): void {
    if (typeof event !== 'string') {
      const { event: ev, data: d } = this.resolveEvent(event);
      this.logger.warn(this.buildPayload(ev, d));
      return;
    }
    this.logger.warn(this.buildPayload(event, data));
  }

  error(
    event: string,
    dataOrStack?: Record<string, unknown> | string,
    errOrContext?: Error | string,
  ): void {
    if (typeof event !== 'string') {
      const { event: ev, data: d } = this.resolveEvent(event);
      this.logger.error(this.buildPayload(ev, d));
      return;
    }
    const err = errOrContext instanceof Error ? errOrContext : undefined;
    const nestContext = typeof errOrContext === 'string' ? errOrContext : undefined;
    this.logger.error(this.buildPayload(event, dataOrStack, err, nestContext));
  }

  debug(event: string, data?: Record<string, unknown>): void {
    if (typeof event !== 'string') {
      const { event: ev, data: d } = this.resolveEvent(event);
      this.logger.debug(this.buildPayload(ev, d));
      return;
    }
    this.logger.debug(this.buildPayload(event, data));
  }

  log(message: string, ...optionalParams: unknown[]): void {
    if (typeof message !== 'string') {
      const { event, data } = this.resolveEvent(message);
      this.logger.info(this.buildPayload(event, data));
      return;
    }
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.info(this.buildPayload('nestjs.log', { message, context }));
  }

  verbose(message: string, ...optionalParams: unknown[]): void {
    if (typeof message !== 'string') {
      const { event, data } = this.resolveEvent(message);
      this.logger.debug(this.buildPayload(event, data));
      return;
    }
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.debug(this.buildPayload('nestjs.verbose', { message, context }));
  }

  fatal(message: string, ...optionalParams: unknown[]): void {
    if (typeof message !== 'string') {
      const { event, data } = this.resolveEvent(message);
      this.logger.fatal(this.buildPayload(event, data));
      return;
    }
    const context = (optionalParams[0] as string | undefined) ?? 'NestJS';
    this.logger.fatal(this.buildPayload('nestjs.fatal', { message, context }));
  }
}
