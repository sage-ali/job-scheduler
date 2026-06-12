import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsArray,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriority } from '../enums/job-priority.enum';
import { JobType, RecurringInterval } from '../enums/job-type.enum';

export class CreateJobDto {
  @ApiProperty({
    enum: JobType,
    example: JobType.SEND_EMAIL,
    description: 'Determines which handler processes this job',
  })
  @IsEnum(JobType)
  type: JobType;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { to: 'user@example.com', subject: 'Welcome', body: 'Hello!' },
    description: 'Handler-specific data. Shape varies by job type.',
  })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: JobPriority,
    example: JobPriority.MEDIUM,
    default: JobPriority.MEDIUM,
    description: '1 = HIGH, 2 = MEDIUM, 3 = LOW. Lower value = higher priority in the queue.',
  })
  @IsOptional()
  @IsInt()
  @Min(JobPriority.HIGH)
  @Max(JobPriority.LOW)
  priority?: JobPriority = JobPriority.MEDIUM;

  @ApiPropertyOptional({
    example: '2026-06-15T09:00:00Z',
    format: 'date-time',
    description: 'ISO 8601 datetime. Job will not run before this time. Omit to run immediately.',
  })
  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;

  @ApiPropertyOptional({
    enum: RecurringInterval,
    example: RecurringInterval.EVERY_1_HOUR,
    description: 'If set, a new occurrence is created after each successful run.',
  })
  @IsOptional()
  @IsEnum(RecurringInterval)
  recurring_interval?: RecurringInterval;

  @ApiPropertyOptional({
    type: [String],
    example: ['b3d4c1e9-f1e2-4a3b-9012-abcdef012345'],
    description:
      'UUIDs of jobs that must complete before this job is eligible to run (DAG dependency).',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  depends_on?: string[];

  @ApiPropertyOptional({
    example: 3,
    default: 3,
    description:
      'Maximum number of retry attempts before the job is moved to the DLQ. Use 0 to disable retries.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  max_retries?: number;
}
