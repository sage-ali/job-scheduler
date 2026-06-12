import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType, RecurringInterval } from '../enums/job-type.enum';
import { JobPriority } from '../enums/job-priority.enum';
import { JobStatus } from '../enums/job-status.enum';

export class JobDto {
  @ApiProperty({ example: 'b3d4c1e9-f1e2-4a3b-9012-abcdef012345', format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-06-11T22:14:10.258Z', format: 'date-time' })
  created_at: string;

  @ApiProperty({ example: '2026-06-11T22:14:10.258Z', format: 'date-time' })
  updated_at: string;

  @ApiProperty({ enum: JobType, example: JobType.SEND_EMAIL })
  type: JobType;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { to: 'user@example.com', subject: 'Welcome', body: 'Hello!' },
  })
  payload: Record<string, unknown>;

  @ApiProperty({
    enum: JobPriority,
    example: JobPriority.MEDIUM,
    description: '1 = HIGH, 2 = MEDIUM, 3 = LOW',
  })
  priority: JobPriority;

  @ApiProperty({ enum: JobStatus, example: JobStatus.PENDING })
  status: JobStatus;

  @ApiProperty({ example: 0 })
  retry_count: number;

  @ApiProperty({ example: 3 })
  max_retries: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Populated after a failed attempt',
  })
  error_message: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    format: 'date-time',
    description: 'ISO 8601 datetime — job will not run before this time',
  })
  scheduled_at: string | null;

  @ApiPropertyOptional({ enum: RecurringInterval, example: null, nullable: true })
  recurring_interval: RecurringInterval | null;

  @ApiPropertyOptional({ example: null, nullable: true, format: 'date-time' })
  next_run_at: string | null;

  @ApiPropertyOptional({ example: null, nullable: true, format: 'date-time' })
  started_at: string | null;

  @ApiPropertyOptional({ example: null, nullable: true, format: 'date-time' })
  completed_at: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: null,
    nullable: true,
    description: 'UUIDs of jobs that must complete before this one runs',
  })
  depends_on: string[] | null;

  @ApiProperty({
    example: 2,
    description:
      'Effective scheduler priority. Lower = higher priority. Boosted over time to prevent starvation.',
  })
  priority_score: number;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 3 })
  total_pages: number;

  @ApiProperty({ example: true })
  has_next: boolean;

  @ApiProperty({ example: false })
  has_previous: boolean;
}

export class QueueStatusDto {
  @ApiProperty({ example: false, description: 'true if the queue is paused' })
  paused: boolean;

  @ApiProperty({
    example: 1,
    description: 'Number of active worker processes connected to this queue',
  })
  workers: number;
}

export class DashboardStatsDto {
  @ApiProperty({ example: 5 })
  pending: number;

  @ApiProperty({ example: 1 })
  processing: number;

  @ApiProperty({ example: 42 })
  completed: number;

  @ApiProperty({ example: 3 })
  failed: number;

  @ApiProperty({ example: 0 })
  cancelled: number;
}
