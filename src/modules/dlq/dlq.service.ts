import { Injectable, Logger, HttpStatus, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DlqJob } from './entities/dlq-job.entity';
import { JobsService } from '../jobs/jobs.service';
import { SseService } from '../../sse/sse.service';
import { CustomHttpException } from '@common/exceptions/custom-http.exception';
import { EmailSimulationHandler } from '@queue/handlers/email-simulation.handler';
import * as SYS_MSG from '@constants/system-messages';
import { env } from '@config/env';

const DLQ_THRESHOLD = env.DLQ_ALERT_THRESHOLD;

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DlqJob)
    private readonly dlqRepository: Repository<DlqJob>,
    @Optional() private readonly jobsService: JobsService,
    @Optional() private readonly emailHandler: EmailSimulationHandler,
    @Optional() private readonly sseService: SseService,
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

    this.sseService?.emit('dlq_added', {
      dlqJobId: saved.id,
      originalJobId: params.originalJobId,
      type: params.type,
    });

    await this.checkThresholdAndAlert();
    return saved;
  }

  async listDlqJobs(
    page = 1,
    limit = 20,
  ): Promise<{
    data: DlqJob[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.dlqRepository.findAndCount({
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });
    const total_pages = Math.ceil(total / limit);
    return {
      data,
      total,
      page,
      limit,
      total_pages,
      has_next: page < total_pages,
      has_previous: page > 1,
    };
  }

  async retryDlqJob(dlqJobId: string): Promise<{ jobId: string }> {
    const dlqJob = await this.dlqRepository.findOne({ where: { id: dlqJobId } });
    if (!dlqJob) {
      throw new CustomHttpException(SYS_MSG.DLQ_JOB_NOT_FOUND(dlqJobId), HttpStatus.NOT_FOUND);
    }

    if (!this.jobsService) {
      throw new CustomHttpException(
        SYS_MSG.HTTP_INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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
    if (count < DLQ_THRESHOLD) return;

    this.logger.error({
      event: 'dlq_threshold_exceeded',
      count,
      threshold: DLQ_THRESHOLD,
    });

    if (this.emailHandler) {
      await this.emailHandler.handle({
        to: env.ALERT_EMAIL,
        subject: SYS_MSG.DLQ_THRESHOLD_EXCEEDED(count, DLQ_THRESHOLD),
        body: `The dead-letter queue has ${count} failed jobs (threshold: ${DLQ_THRESHOLD}). Review and retry from the DLQ view.`,
      });
    }
  }
}
