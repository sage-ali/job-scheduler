import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    throw new Error('Not implemented');
  }

  async findJobsByIds(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return [];
    throw new Error('Not implemented');
  }

  async countByStatus(): Promise<Record<JobStatus, number>> {
    throw new Error('Not implemented');
  }
}
