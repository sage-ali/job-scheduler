import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { AbstractModelAction } from '@hng-sdk/orm';
import { Job } from './entities/job.entity';
import { JobStatus } from './enums/job-status.enum';

@Injectable()
export class JobModelAction extends AbstractModelAction<Job> {
  constructor(
    @InjectRepository(Job)
    repository: Repository<Job>,
  ) {
    super(repository, Job);
  }

  async findEligibleJobs(limit: number): Promise<Job[]> {
    const now = new Date();
    return this.repository.find({
      where: [
        { status: JobStatus.PENDING, scheduled_at: IsNull() },
        { status: JobStatus.PENDING, scheduled_at: LessThanOrEqual(now) },
      ],
      order: { priority_score: 'ASC' },
      take: limit,
    });
  }

  async findJobsByIds(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return [];
    return this.repository.find({ where: { id: In(ids) } });
  }

  async findStarvingPendingJobs(thresholdMs: number, limit: number): Promise<Job[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.repository.find({
      where: { status: JobStatus.PENDING, created_at: LessThan(cutoff) },
      order: { priority_score: 'ASC' },
      take: limit,
    });
  }

  async claimJob(jobId: string, leaseExpiresAt: Date): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.PROCESSING,
        started_at: new Date(),
        lease_expires_at: leaseExpiresAt,
      })
      .where('id = :id AND status = :status', { id: jobId, status: JobStatus.PENDING })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async findStalledJobs(limit: number): Promise<Job[]> {
    return this.repository.find({
      where: { status: JobStatus.PROCESSING, lease_expires_at: LessThan(new Date()) },
      take: limit,
      order: { lease_expires_at: 'ASC' },
    });
  }

  async countByStatus(): Promise<Record<JobStatus, number>> {
    const rows = await this.repository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany<{ status: string; count: string }>();

    const counts = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<
      JobStatus,
      number
    >;

    for (const row of rows) {
      counts[row.status as JobStatus] = parseInt(row.count, 10);
    }

    return counts;
  }
}
