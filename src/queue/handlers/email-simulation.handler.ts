import { Injectable, Logger } from '@nestjs/common';
import type { SendEmailPayload } from '@modules/jobs/interfaces/job-payload.interface';
import { maskEmail } from '@common/logger/pii';

// 15% failure rate simulates realistic retry/DLQ traffic without a real SMTP server.
const FAILURE_RATE = 0.15;
const MIN_DELAY_MS = 100;
const MAX_DELAY_MS = 600;

function randomDelay(): number {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS) + MIN_DELAY_MS);
}

function shouldSimulateFail(): boolean {
  return Math.random() < FAILURE_RATE;
}

@Injectable()
export class EmailSimulationHandler {
  private readonly logger = new Logger(EmailSimulationHandler.name);

  async handle(payload: SendEmailPayload): Promise<void> {
    const { to, subject, body } = payload;

    this.logger.log({
      event: 'email_simulation_started',
      to: maskEmail(to),
      subject,
    });

    await new Promise((resolve) => setTimeout(resolve, randomDelay()));

    if (shouldSimulateFail()) {
      this.logger.warn({
        event: 'email_simulation_provider_error',
        to: maskEmail(to),
      });
      throw new Error(`Simulated email delivery failure to ${maskEmail(to)}`);
    }

    this.logger.log({
      event: 'email_simulation_sent',
      to: maskEmail(to),
      subject,
      bodyLength: body?.length ?? 0,
    });
  }
}
