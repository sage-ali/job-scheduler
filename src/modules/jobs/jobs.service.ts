import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { FindOptionsWhere } from 'typeorm';
import { QUEUES, JOBS } from '@common/constants/queue.constants';
import { CustomHttpException } from '@common/exceptions/custom-http.exception';
import { JobModelAction } from './jobs.model-action';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs.query.dto';
import { Job } from './entities/job.entity';
import { JobStatus } from './enums/job-status.enum';
import * as SYS_MSG from '@constants/system-messages';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly jobModelAction: JobModelAction,
    @InjectQueue(QUEUES.JOBS) private readonly jobsQueue: Queue,
  ) {}

  async createJob(dto: CreateJobDto): Promise<Job> {
    const job = await this.jobModelAction.create({
      createPayload: {
        type: dto.type,
        payload: dto.payload,
        priority: dto.priority ?? 2,
        status: JobStatus.PENDING,
        scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
        recurring_interval: dto.recurring_interval ?? null,
        depends_on: dto.depends_on ?? null,
        retry_count: 0,
        priority_score: dto.priority ?? 2,
      },
      transactionOptions: { useTransaction: false },
    });

    this.logger.log({
      event: 'job_created',
      jobId: job.id,
      type: job.type,
      priority: job.priority,
      scheduled_at: job.scheduled_at,
    });

    const isImmediate = !job.scheduled_at && (!job.depends_on || job.depends_on.length === 0);

    if (isImmediate) {
      await this.enqueue(job);
    }

    return job;
  }

  async listJobs(query: ListJobsQueryDto): Promise<{
    payload: Job[];
    paginationMeta: unknown;
  }> {
    const filterRecordOptions: FindOptionsWhere<Job> = {};
    if (query.status) filterRecordOptions.status = query.status;
    if (query.type) filterRecordOptions.type = query.type;
    if (query.priority) filterRecordOptions.priority = query.priority;

    return this.jobModelAction.list({
      filterRecordOptions,
      paginationPayload: { page: query.page ?? 1, limit: query.limit ?? 20 },
      order: { priority_score: 'ASC', created_at: 'ASC' },
    });
  }

  async getJob(id: string): Promise<Job> {
    const job = await this.jobModelAction.get({ identifierOptions: { id } });
    if (!job) throw new CustomHttpException(SYS_MSG.JOB_NOT_FOUND(id), HttpStatus.NOT_FOUND);
    return job;
  }

  async cancelJob(id: string): Promise<Job> {
    const job = await this.getJob(id);

    if (job.status === JobStatus.PROCESSING) {
      throw new CustomHttpException(SYS_MSG.JOB_ALREADY_PROCESSING, HttpStatus.CONFLICT);
    }

    const terminalStatuses = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED];
    if (terminalStatuses.includes(job.status)) {
      throw new CustomHttpException(
        SYS_MSG.JOB_CANNOT_BE_CANCELLED(job.status),
        HttpStatus.BAD_REQUEST,
      );
    }

    if (job.status === JobStatus.PENDING) {
      // Remove from Bull before the DB update to prevent a race where the worker
      // picks up the job between the status change and the Bull removal.
      const bullJob = await this.jobsQueue.getJob(`job:${id}`);
      if (bullJob) {
        try {
          await bullJob.remove();
        } catch {
          // Job may have been picked up between getJob and remove — the worker
          // will check DB status and discard it.
        }
      }
    }

    await this.jobModelAction.update({
      identifierOptions: { id },
      updatePayload: { status: JobStatus.CANCELLED },
      transactionOptions: { useTransaction: false },
    });

    this.logger.log({ event: 'job_cancelled', jobId: id, previousStatus: job.status });

    return { ...job, status: JobStatus.CANCELLED };
  }

  async getDashboardStats(): Promise<Record<JobStatus, number>> {
    return this.jobModelAction.countByStatus();
  }

  async enqueue(job: Job): Promise<void> {
    const delay = job.scheduled_at ? Math.max(0, job.scheduled_at.getTime() - Date.now()) : 0;

    const bullJob = await this.jobsQueue.add(
      JOBS.PROCESS_JOB,
      { jobId: job.id },
      {
        priority: job.priority,
        jobId: `job:${job.id}`,
        attempts: job.max_retries,
        ...(delay > 0 && { delay }),
      },
    );

    this.logger.log({
      event: 'job_enqueued',
      jobId: job.id,
      bullJobId: bullJob.id,
      priority: job.priority,
      delay,
    });
  }
}
