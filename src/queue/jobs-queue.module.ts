import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUES, JOB_RETENTION } from '../common/constants/queue.constants';
import { Job } from '../modules/jobs/entities/job.entity';
import { JobModelAction } from '../modules/jobs/jobs.model-action';
import { DlqJob } from '../modules/dlq/entities/dlq-job.entity';
import { DlqService } from '../modules/dlq/dlq.service';
import { RedisModule } from '../modules/redis/redis.module';
import { QueueModule } from './queue.module';
import { JobWorkerProcessor } from './processors/job-worker.processor';
import { EmailSimulationHandler } from './handlers/email-simulation.handler';
import { BackoffService } from '../worker/backoff.service';

@Module({
  imports: [
    QueueModule,
    RedisModule,
    TypeOrmModule.forFeature([Job, DlqJob]),
    BullModule.registerQueueAsync({
      name: QUEUES.JOBS,
      useFactory: (config: ConfigService) => ({
        settings: {
          // Max time a worker holds a job lock before Bull re-queues it as stalled.
          // Set to 3× your longest expected handler duration.
          lockDuration: 60_000,
        },
        defaultJobOptions: {
          attempts: config.get<number>('QUEUE_MAX_ATTEMPTS') ?? 3,
          backoff: {
            // Exponential with jitter is implemented inside the processor via
            // onFailed — Bull's built-in backoff is used only as a safety net.
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: { age: JOB_RETENTION.COMPLETED_MS / 1000, count: 1000 },
          removeOnFail: { age: JOB_RETENTION.FAILED_MS / 1000 },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    JobWorkerProcessor,
    EmailSimulationHandler,
    BackoffService,
    JobModelAction,
    DlqService,
  ],
  exports: [BullModule],
})
export class JobsQueueModule {}
