import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriority } from '../enums/job-priority.enum';
import { JobStatus } from '../enums/job-status.enum';
import { JobType } from '../enums/job-type.enum';

export class ListJobsQueryDto {
  @ApiPropertyOptional({ enum: JobStatus, description: 'Filter by job status' })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ enum: JobType, description: 'Filter by job type' })
  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @ApiPropertyOptional({
    enum: JobPriority,
    description: 'Filter by priority level (1 = HIGH, 2 = MEDIUM, 3 = LOW)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(JobPriority.HIGH)
  @Max(JobPriority.LOW)
  priority?: JobPriority;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
