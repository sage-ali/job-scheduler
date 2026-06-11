import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@common/entities/base.entity';

@Entity('dlq_jobs')
export class DlqJob extends BaseEntity {
  @Column({ type: 'uuid' })
  original_job_id: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'int' })
  priority: number;

  @Column({ type: 'text' })
  error_message: string;

  @Column({ type: 'int', default: 3 })
  retry_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_attempted_at: Date | null;
}
