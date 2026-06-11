import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JobPriority } from '../enums/job-priority.enum';
import { JobStatus } from '../enums/job-status.enum';
import { JobType } from '../enums/job-type.enum';

export class ListJobsQueryDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @IsOptional()
  @IsInt()
  @Min(JobPriority.HIGH)
  @Max(JobPriority.LOW)
  priority?: JobPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
