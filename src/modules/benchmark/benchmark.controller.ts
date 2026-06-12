import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BenchmarkService } from './benchmark.service';
import { RunBenchmarkDocs } from './docs/benchmark-swagger.doc';
import * as SYS_MSG from '@constants/system-messages';

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
}
