import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOB_RETENTION } from '../common/constants/queue.constants';
import { QueueModule } from './queue.module';

@Module({
  imports: [
    QueueModule,
    BullModule.registerQueueAsync({
      name: QUEUES.JOBS,
      useFactory: (config: ConfigService) => ({
        settings: { lockDuration: 60_000 },
        defaultJobOptions: {
          attempts: config.get<number>('QUEUE_MAX_ATTEMPTS') ?? 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: JOB_RETENTION.COMPLETED_MS / 1000, count: 1000 },
          removeOnFail: { age: JOB_RETENTION.FAILED_MS / 1000 },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueClientModule {}
