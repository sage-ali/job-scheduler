import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqJob } from './entities/dlq-job.entity';
import { JobsService } from '../jobs/jobs.service';
import { CustomHttpException } from '@common/exceptions/custom-http.exception';
import * as SYS_MSG from '@constants/system-messages';
import { env } from '@config/env';

// Defined here so the value is testable. Overridable via DLQ_ALERT_THRESHOLD env var.
const DLQ_THRESHOLD = env.DLQ_ALERT_THRESHOLD;

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DlqJob)
    private readonly dlqRepository: Repository<DlqJob>,
    private readonly jobsService: JobsService,
  ) {}

  async moveToDlq(params: {
    originalJobId: string;
    type: string;
    payload: Record<string, unknown>;
    priority: number;
    errorMessage: string;
    retryCount: number;
  }): Promise<DlqJob> {
    const entry = this.dlqRepository.create({
      original_job_id: params.originalJobId,
      type: params.type,
      payload: params.payload,
      priority: params.priority,
      error_message: params.errorMessage,
      retry_count: params.retryCount,
      last_attempted_at: new Date(),
    });

    const saved = await this.dlqRepository.save(entry);

    this.logger.error({
      event: 'job_moved_to_dlq',
      originalJobId: params.originalJobId,
      dlqJobId: saved.id,
      type: params.type,
      retryCount: params.retryCount,
      error: params.errorMessage,
    });

    await this.checkThresholdAndAlert();
    return saved;
  }

  async listDlqJobs(): Promise<DlqJob[]> {
    return this.dlqRepository.find({ order: { created_at: 'DESC' } });
  }

  async retryDlqJob(dlqJobId: string): Promise<{ jobId: string }> {
    const dlqJob = await this.dlqRepository.findOne({
      where: { id: dlqJobId },
    });
    if (!dlqJob) {
      throw new CustomHttpException(SYS_MSG.DLQ_JOB_NOT_FOUND(dlqJobId), HttpStatus.NOT_FOUND);
    }

    // If it fails again after 3 attempts it comes back to the DLQ.
    const newJob = await this.jobsService.createJob({
      type: dlqJob.type as never,
      payload: dlqJob.payload,
      priority: dlqJob.priority as never,
    });

    this.logger.log({
      event: 'dlq_job_retried',
      dlqJobId,
      newJobId: newJob.id,
      type: dlqJob.type,
    });

    await this.dlqRepository.delete(dlqJobId);
    return { jobId: newJob.id };
  }

  private async checkThresholdAndAlert(): Promise<void> {
    const count = await this.dlqRepository.count();

    if (count >= DLQ_THRESHOLD) {
      this.logger.error({
        event: 'dlq_threshold_exceeded',
        count,
        threshold: DLQ_THRESHOLD,
        message: SYS_MSG.DLQ_THRESHOLD_EXCEEDED(count, DLQ_THRESHOLD),
        alertEmail: env.ALERT_EMAIL,
      });
    }
  }
}
