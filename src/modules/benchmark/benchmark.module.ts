import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { BenchmarkController } from './benchmark.controller';
import { BenchmarkService } from './benchmark.service';

@Module({
  imports: [JobsModule],
  controllers: [BenchmarkController],
  providers: [BenchmarkService],
})
export class BenchmarkModule {}
