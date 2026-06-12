import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../modules/jobs/entities/job.entity';
import { JobModelAction } from '../modules/jobs/jobs.model-action';
import { DlqJob } from '../modules/dlq/entities/dlq-job.entity';
import { DlqService } from '../modules/dlq/dlq.service';
import { SseModule } from '../sse/sse.module';
import { QueueClientModule } from './queue-client.module';
import { JobWorkerProcessor } from './processors/job-worker.processor';
import { EmailSimulationHandler } from './handlers/email-simulation.handler';
import { WebhookDeliveryHandler } from './handlers/webhook-delivery.handler';
import { LogProcessingHandler } from './handlers/log-processing.handler';
import { BackoffService } from '../worker/backoff.service';

@Module({
  imports: [QueueClientModule, SseModule, TypeOrmModule.forFeature([Job, DlqJob])],
  providers: [
    JobWorkerProcessor,
    EmailSimulationHandler,
    WebhookDeliveryHandler,
    LogProcessingHandler,
    BackoffService,
    JobModelAction,
    DlqService,
  ],
  exports: [],
})
export class JobsQueueModule {}
