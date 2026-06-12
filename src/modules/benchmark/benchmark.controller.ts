import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BenchmarkService } from './benchmark.service';
import { RunBenchmarkDocs, RunThroughputDocs } from './docs/benchmark-swagger.doc';
import { JobType } from '../jobs/enums/job-type.enum';
import * as SYS_MSG from '@constants/system-messages';

class ThroughputDto {
  @IsInt()
  @Min(10)
  @Max(200)
  n: number;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;
}

@ApiTags('Benchmark')
@Controller('benchmark')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Get()
  @RunBenchmarkDocs()
  run(@Query('n') rawN?: string) {
    const n = Math.min(Math.max(parseInt(rawN ?? '10000', 10) || 10000, 100), 100_000);
    const result = this.benchmarkService.run(n);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.BENCHMARK_COMPLETE, data: result };
  }

  @Post('throughput')
  @RunThroughputDocs()
  async throughput(@Body() dto: ThroughputDto) {
    const result = await this.benchmarkService.runThroughput(dto.n, dto.type ?? JobType.SEND_EMAIL);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.THROUGHPUT_BENCHMARK_COMPLETE,
      data: result,
    };
  }
}
