import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsQueueModule } from '@queue/jobs-queue.module';
import { SseModule } from '../../sse/sse.module';
import { Job } from './entities/job.entity';
import { JobModelAction } from './jobs.model-action';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), JobsQueueModule, SseModule],
  controllers: [JobsController],
  providers: [JobsService, JobModelAction],
  exports: [JobsService, JobModelAction],
})
export class JobsModule {}
