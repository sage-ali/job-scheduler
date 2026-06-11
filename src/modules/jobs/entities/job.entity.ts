import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';
import { JobPriority } from '../enums/job-priority.enum';
import { JobStatus } from '../enums/job-status.enum';
import { JobType, RecurringInterval } from '../enums/job-type.enum';

@Entity('jobs')
export class Job extends BaseEntity {
  @Column({ type: 'varchar' })
  type: JobType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'int', default: JobPriority.MEDIUM })
  priority: JobPriority;

  @Column({ type: 'varchar', default: JobStatus.PENDING })
  status: JobStatus;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @Column({ type: 'int', default: 3 })
  max_retries: number;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  // Null means "run immediately". A future timestamp means "don't start before this".
  @Column({ type: 'timestamptz', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'varchar', nullable: true, enum: RecurringInterval })
  recurring_interval: RecurringInterval | null;

  // Set after the last run of a recurring job — the scheduler uses this to compute
  // the next scheduled_at when re-enqueueing.
  @Column({ type: 'timestamptz', nullable: true })
  next_run_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  // DAG: job IDs that must be completed before this job can run.
  // Stored as a comma-separated list by TypeORM simple-array.
  @Column({ type: 'simple-array', nullable: true })
  depends_on: string[] | null;

  // Effective priority score used by the heap for ordering.
  // Computed as: priority * BASE_WEIGHT + age_boost (for starvation prevention).
  // Lower score = higher priority. Refreshed by the scheduler sweep.
  @Column({ type: 'float', default: 0 })
  priority_score: number;
}
