import { Injectable, Logger } from '@nestjs/common';
import type { SendEmailPayload } from '@modules/jobs/interfaces/job-payload.interface';
import { maskEmail } from '@common/logger/pii';
import { randomDelay, shouldSimulateFail } from './simulation.utils';

// 15% failure rate simulates realistic retry/DLQ traffic without a real SMTP server.
const FAILURE_RATE = 0.15;

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

    await randomDelay(100, 600);

    if (shouldSimulateFail(FAILURE_RATE)) {
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
