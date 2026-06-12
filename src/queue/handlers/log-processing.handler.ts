import { Injectable, Logger } from '@nestjs/common';
import type { LogProcessingPayload } from '@modules/jobs/interfaces/job-payload.interface';
import { randomDelay, shouldSimulateFail } from './simulation.utils';

const FAILURE_RATE = 0.1;

@Injectable()
export class LogProcessingHandler {
  private readonly logger = new Logger(LogProcessingHandler.name);

  async handle(payload: LogProcessingPayload): Promise<void> {
    const { source, level, message, metadata = {} } = payload;

    if (!source || !message) {
      throw new Error('LogProcessingHandler: payload.source and payload.message are required');
    }

    this.logger.log({ event: 'log_processing_started', source, level });

    await randomDelay(20, 200);

    if (shouldSimulateFail(FAILURE_RATE)) {
      this.logger.warn({ event: 'log_ingest_failed', source, level });
      throw new Error(`Simulated log ingest failure from source: ${source}`);
    }

    this.logger.log({
      event: 'log_processed',
      source,
      level,
      message,
      lineCount: 1,
      metadataKeys: Object.keys(metadata),
      processedAt: new Date().toISOString(),
    });
  }
}
