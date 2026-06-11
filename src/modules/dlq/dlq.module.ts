import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqJob } from './entities/dlq-job.entity';
import { DlqService } from './dlq.service';
import { DlqController } from './dlq.controller';
import { JobsModule } from '../jobs/jobs.module';
import { EmailSimulationHandler } from '@queue/handlers/email-simulation.handler';

@Module({
  imports: [TypeOrmModule.forFeature([DlqJob]), JobsModule],
  controllers: [DlqController],
  providers: [DlqService, EmailSimulationHandler],
  exports: [DlqService],
})
export class DlqModule {}
