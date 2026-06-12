import { ApiProperty } from '@nestjs/swagger';

export class AlgoMetricsDto {
  @ApiProperty({
    example: 12.45,
    description: 'Time to insert all N jobs into the structure (milliseconds)',
  })
  insertMs: number;

  @ApiProperty({
    example: 8.72,
    description: 'Time to drain all N jobs from the structure (milliseconds)',
  })
  drainMs: number;
}

export class BenchmarkResultDto {
  @ApiProperty({ example: 10000, description: 'Number of synthetic jobs used in this run' })
  n: number;

  @ApiProperty({
    type: AlgoMetricsDto,
    description:
      'Min-heap (HeapPriorityQueue) timings. ' +
      'Insert: O(log n) — each push sifts up at most log₂(n) levels. ' +
      'Drain: O(n log n) — n pops, each sifting down. ' +
      'Output is priority-ordered: lowest score (highest urgency) first.',
  })
  heap: AlgoMetricsDto;

  @ApiProperty({
    type: AlgoMetricsDto,
    description:
      'Timing-wheel timings. 3600 slots × 1 s; delays > 1 h fall into an overflow bucket. ' +
      'Insert: O(1) — slot index = floor(delayMs / 1000) % 3600. ' +
      'Drain: O(slots + n) — all 3600 slots are ticked regardless of N, so drain has a ' +
      'fixed 3600-slot floor. At small N this makes drain slower than the heap.',
  })
  wheel: AlgoMetricsDto;

  @ApiProperty({
    enum: ['heap', 'wheel'],
    example: 'wheel',
    description: 'Algorithm with the lower insert time for this run',
  })
  insertWinner: 'heap' | 'wheel';

  @ApiProperty({
    enum: ['heap', 'wheel'],
    example: 'heap',
    description: 'Algorithm with the lower drain time for this run',
  })
  drainWinner: 'heap' | 'wheel';
}
