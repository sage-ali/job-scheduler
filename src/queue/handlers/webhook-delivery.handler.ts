import { Injectable, Logger } from '@nestjs/common';
import type { WebhookDeliveryPayload } from '@modules/jobs/interfaces/job-payload.interface';
import { randomDelay, shouldSimulateFail } from './simulation.utils';

const FAILURE_RATE = 0.2;

@Injectable()
export class WebhookDeliveryHandler {
  private readonly logger = new Logger(WebhookDeliveryHandler.name);

  async handle(payload: WebhookDeliveryPayload): Promise<void> {
    const { url, method = 'POST', headers = {}, body } = payload;

    if (!url) {
      throw new Error('WebhookDeliveryHandler: payload.url is required');
    }

    const start = Date.now();

    this.logger.log({
      event: 'webhook_delivery_started',
      url,
      method,
      headerCount: Object.keys(headers).length,
    });

    await randomDelay(50, 400);

    if (shouldSimulateFail(FAILURE_RATE)) {
      this.logger.warn({ event: 'webhook_delivery_timeout', url, method });
      throw new Error(`Simulated webhook timeout: ${method} ${url}`);
    }

    this.logger.log({
      event: 'webhook_delivered',
      url,
      method,
      statusCode: 200,
      durationMs: Date.now() - start,
      bodyKeys: body ? Object.keys(body) : [],
    });
  }
}
