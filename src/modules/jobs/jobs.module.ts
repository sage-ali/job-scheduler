import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueClientModule } from '@queue/queue-client.module';
import { SseModule } from '../../sse/sse.module';
import { Job } from './entities/job.entity';
import { JobModelAction } from './jobs.model-action';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), QueueClientModule, SseModule],
  controllers: [JobsController],
  providers: [JobsService, JobModelAction],
  exports: [JobsService, JobModelAction],
})
export class JobsModule {}
