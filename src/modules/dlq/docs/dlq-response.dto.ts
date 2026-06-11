import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DlqJobDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-abcdef012345', format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-06-11T22:14:10.258Z', format: 'date-time' })
  created_at: string;

  @ApiProperty({ example: '2026-06-11T22:14:10.258Z', format: 'date-time' })
  updated_at: string;

  @ApiProperty({
    example: 'b3d4c1e9-f1e2-4a3b-9012-abcdef012345',
    format: 'uuid',
    description: 'ID of the original job that exhausted all retries',
  })
  original_job_id: string;

  @ApiProperty({ example: 'send_email' })
  type: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { to: 'user@example.com', subject: 'Welcome' },
  })
  payload: Record<string, unknown>;

  @ApiProperty({ example: 2, description: '1 = HIGH, 2 = MEDIUM, 3 = LOW' })
  priority: number;

  @ApiProperty({ example: 'Simulated email delivery failure to use***@example.com' })
  error_message: string;

  @ApiProperty({ example: 3, description: 'Number of attempts made before moving to DLQ' })
  retry_count: number;

  @ApiPropertyOptional({
    example: '2026-06-11T22:14:09.800Z',
    nullable: true,
    format: 'date-time',
  })
  last_attempted_at: string | null;
}

export class RetryResponseDto {
  @ApiProperty({
    example: 'c4d5e6f7-2345-6789-0123-bcdef0123456',
    format: 'uuid',
    description: 'ID of the newly created job that replaces the DLQ entry',
  })
  jobId: string;
}
