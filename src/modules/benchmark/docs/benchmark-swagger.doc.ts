import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import * as SYS_MSG from '@constants/system-messages';
import {
  AlgoMetricsDto,
  BenchmarkResultDto,
  LatencyStatsDto,
  ThroughputResultDto,
} from './benchmark-response.dto';

const errorSchema = (statusCode: HttpStatus, error: string, message: string) => ({
  example: {
    success: false,
    statusCode,
    error,
    message,
    path: '/api/v1/benchmark',
    timestamp: '2026-06-12T00:00:00.000Z',
  },
});

export function RunBenchmarkDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Benchmark min-heap vs timing-wheel for N synthetic jobs',
      description:
        'Runs two in-process data-structure benchmarks and returns the timings.\n\n' +
        '**Min-heap (`HeapPriorityQueue`)** — a binary min-heap ordered by ' +
        '`(priority_score, scheduled_at, created_at)`. Insert is O(log n); drain is O(n log n). ' +
        'Output is priority-first, making it the right choice when urgency matters more than ' +
        'absolute time.\n\n' +
        '**Timing wheel** — 3600 slots × 1 s, indexed by `floor(delayMs / 1000) % 3600`. ' +
        'Jobs with a delay > 3600 s fall into an overflow bucket. ' +
        'Insert is O(1); drain ticks all 3600 slots regardless of N, giving it a fixed ' +
        'floor cost that dominates at small N.\n\n' +
        '**Why the project uses the heap:** at the actual scheduler batch size (≤ 50 jobs per sweep) ' +
        'the heap drains ~10× faster than the wheel (the wheel always pays the 3600-slot tick cost). ' +
        'The heap also produces priority-ordered output, which the scheduler needs to enqueue the ' +
        'most urgent jobs first. The timing wheel would win insert throughput at N > ~50 k, but ' +
        'that scenario never occurs in a single sweep.\n\n' +
        '`n` is clamped to [100, 100 000] server-side to prevent the benchmark from blocking the ' +
        'event loop for too long.',
    }),
    ApiQuery({
      name: 'n',
      required: false,
      type: Number,
      example: 10000,
      description:
        'Number of synthetic jobs to insert and drain. ' +
        'Clamped to [100, 100 000]. Defaults to 10 000 if omitted or invalid.',
    }),
    ApiExtraModels(BenchmarkResultDto, AlgoMetricsDto),
    ApiOkResponse({
      description: SYS_MSG.BENCHMARK_COMPLETE,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.BENCHMARK_COMPLETE },
          data: { $ref: getSchemaPath(BenchmarkResultDto) },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'Unexpected server error',
      schema: errorSchema(
        HttpStatus.INTERNAL_SERVER_ERROR,
        SYS_MSG.HTTP_INTERNAL_SERVER_ERROR_NAME,
        SYS_MSG.HTTP_INTERNAL_SERVER_ERROR,
      ),
    }),
  );
}

export function RunThroughputDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'End-to-end job throughput benchmark',
      description:
        'Creates N real jobs (max_retries=0), waits for every job to reach a terminal state, ' +
        'then returns queue-wait and processing latency percentiles.\n\n' +
        '**Queue wait** (`created_at → started_at`): time a job sits in Bull/Redis before a ' +
        'worker claims it. Grows linearly with backlog depth.\n\n' +
        '**Processing** (`started_at → completed_at`): time spent inside the worker handler. ' +
        'Stable under load — reflects handler latency, not queue depth.\n\n' +
        '`n` is clamped to [10, 200] to keep the request within a reasonable wall-clock budget.',
    }),
    ApiBody({
      schema: {
        properties: {
          n: { type: 'number', example: 100, description: 'Number of jobs (10–200)' },
          type: {
            type: 'string',
            enum: ['send_email', 'webhook_delivery', 'log_processing'],
            example: 'send_email',
          },
        },
        required: ['n'],
      },
    }),
    ApiExtraModels(ThroughputResultDto, LatencyStatsDto),
    ApiOkResponse({
      description: SYS_MSG.THROUGHPUT_BENCHMARK_COMPLETE,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.THROUGHPUT_BENCHMARK_COMPLETE },
          data: { $ref: getSchemaPath(ThroughputResultDto) },
        },
      },
    }),
  );
}
