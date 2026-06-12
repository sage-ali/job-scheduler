import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BenchmarkService } from './benchmark.service';
import * as SYS_MSG from '@constants/system-messages';

@ApiTags('Benchmark')
@Controller('benchmark')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Get()
  @ApiOperation({ summary: 'Benchmark heap vs timing-wheel for N synthetic jobs' })
  @ApiQuery({ name: 'n', required: false, type: Number, example: 10000 })
  run(@Query('n') rawN?: string) {
    const n = Math.min(Math.max(parseInt(rawN ?? '10000', 10) || 10000, 100), 100_000);
    const result = this.benchmarkService.run(n);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.BENCHMARK_COMPLETE, data: result };
  }
}
