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
import { JobPriority } from '../enums/job-priority.enum';
import { JobType, RecurringInterval } from '../enums/job-type.enum';

export class CreateJobDto {
  @IsEnum(JobType)
  type: JobType;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(JobPriority.HIGH)
  @Max(JobPriority.LOW)
  priority?: JobPriority = JobPriority.MEDIUM;

  @IsOptional()
  @IsISO8601()
  scheduled_at?: string;

  @IsOptional()
  @IsEnum(RecurringInterval)
  recurring_interval?: RecurringInterval;

  // DAG: IDs of jobs that must complete before this one runs.
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  depends_on?: string[];
}
