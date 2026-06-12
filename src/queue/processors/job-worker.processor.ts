import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  OnQueueStalled,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job as BullJob } from 'bull';
import { JOBS, QUEUES } from '@common/constants/queue.constants';
import { JobModelAction } from '@modules/jobs/jobs.model-action';
import { DlqService } from '@modules/dlq/dlq.service';
import { JobStatus } from '@modules/jobs/enums/job-status.enum';
import { JobType, RECURRING_INTERVAL_MS } from '@modules/jobs/enums/job-type.enum';
import { Job } from '@modules/jobs/entities/job.entity';
import { EmailSimulationHandler } from '../handlers/email-simulation.handler';
import { WebhookDeliveryHandler } from '../handlers/webhook-delivery.handler';
import { LogProcessingHandler } from '../handlers/log-processing.handler';
import type {
  SendEmailPayload,
  WebhookDeliveryPayload,
  LogProcessingPayload,
} from '@modules/jobs/interfaces/job-payload.interface';
import { BackoffService } from '@worker/backoff.service';
import { SseService } from '../../sse/sse.service';
import { env } from '@config/env';

interface WorkerJobData {
  jobId: string;
}

@Processor(QUEUES.JOBS)
export class JobWorkerProcessor {
  private readonly logger = new Logger(JobWorkerProcessor.name);

  constructor(
    private readonly jobModelAction: JobModelAction,
    private readonly dlqService: DlqService,
    private readonly emailHandler: EmailSimulationHandler,
    private readonly webhookHandler: WebhookDeliveryHandler,
    private readonly logHandler: LogProcessingHandler,
    private readonly backoffService: BackoffService,
    private readonly sseService: SseService,
  ) {}

  @Process({ name: JOBS.PROCESS_JOB, concurrency: env.QUEUE_CONCURRENCY })
  async handleJob(bullJob: BullJob<WorkerJobData>): Promise<void> {
    const { jobId } = bullJob.data;

    const job = await this.jobModelAction.get({ identifierOptions: { id: jobId } });

    if (!job) {
      this.logger.warn({ event: 'job_not_found', jobId, bullJobId: bullJob.id });
      return;
    }

    if (job.status === JobStatus.CANCELLED) {
      this.logger.log({ event: 'job_skip_cancelled', jobId });
      return;
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      this.logger.log({ event: 'job_skip_terminal', jobId, status: job.status });
      return;
    }

    if (job.depends_on && job.depends_on.length > 0) {
      const deps = await this.jobModelAction.findJobsByIds(job.depends_on);
      const unmet = deps.filter((d) => d.status !== JobStatus.COMPLETED);
      if (unmet.length > 0) {
        this.logger.warn({
          event: 'job_dag_unmet',
          jobId,
          unmetDeps: unmet.map((d) => d.id),
        });
        // Return without throwing — Bull won't retry. Scheduler sweep re-enqueues when deps resolve.
        return;
      }
    }

    // Atomic claim: UPDATE WHERE status = 'pending' — exactly one worker wins this race.
    const leaseExpiresAt = new Date(Date.now() + env.LEASE_TTL_SECONDS * 1000);
    const claimed = await this.jobModelAction.claimJob(jobId, leaseExpiresAt);

    if (!claimed) {
      this.logger.warn({ event: 'job_claim_failed', jobId, bullJobId: bullJob.id });
      return;
    }

    this.sseService.emit('job_started', { id: jobId, status: JobStatus.PROCESSING });

    await this.dispatch(job.type as JobType, job.payload);

    await this.jobModelAction.update({
      identifierOptions: { id: jobId },
      updatePayload: {
        status: JobStatus.COMPLETED,
        completed_at: new Date(),
        lease_expires_at: null,
      },
      transactionOptions: { useTransaction: false },
    });
    this.sseService.emit('job_completed', { id: jobId, status: JobStatus.COMPLETED });

    if (job.recurring_interval) {
      await this.scheduleNextRecurrence(job);
    }

    this.logger.log({ event: 'job_completed', jobId, type: job.type });
  }

  private async scheduleNextRecurrence(job: Job): Promise<void> {
    const intervalMs = RECURRING_INTERVAL_MS[job.recurring_interval!];
    const nextAt = new Date(Date.now() + intervalMs);

    await this.jobModelAction.create({
      createPayload: {
        type: job.type,
        payload: job.payload,
        priority: job.priority,
        status: JobStatus.PENDING,
        scheduled_at: nextAt,
        recurring_interval: job.recurring_interval,
        depends_on: null,
        retry_count: 0,
        priority_score: job.priority,
      },
      transactionOptions: { useTransaction: false },
    });

    this.logger.log({
      event: 'recurring_job_rescheduled',
      originalJobId: job.id,
      interval: job.recurring_interval,
      nextAt,
    });
  }

  private async dispatch(type: JobType, payload: Record<string, unknown>): Promise<void> {
    switch (type) {
      case JobType.SEND_EMAIL:
        await this.emailHandler.handle(payload as unknown as SendEmailPayload);
        break;
      case JobType.WEBHOOK_DELIVERY:
        await this.webhookHandler.handle(payload as unknown as WebhookDeliveryPayload);
        break;
      case JobType.LOG_PROCESSING:
        await this.logHandler.handle(payload as unknown as LogProcessingPayload);
        break;
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  @OnQueueActive()
  onActive(bullJob: BullJob<WorkerJobData>): void {
    this.logger.log({
      event: 'job_bull_active',
      jobId: bullJob.data.jobId,
      bullJobId: bullJob.id,
      attempt: bullJob.attemptsMade + 1,
    });
  }

  @OnQueueCompleted()
  onCompleted(bullJob: BullJob<WorkerJobData>): void {
    const duration = (bullJob.finishedOn ?? Date.now()) - (bullJob.processedOn ?? Date.now());
    this.logger.log({
      event: 'job_bull_completed',
      jobId: bullJob.data.jobId,
      bullJobId: bullJob.id,
      durationMs: duration,
    });
  }

  @OnQueueFailed()
  async onFailed(bullJob: BullJob<WorkerJobData>, error: Error): Promise<void> {
    const maxAttempts = bullJob.opts.attempts ?? 3;
    const willRetry = bullJob.attemptsMade < maxAttempts;

    this.logger.error({
      event: 'job_bull_failed',
      jobId: bullJob.data.jobId,
      bullJobId: bullJob.id,
      error: error.message,
      attemptsMade: bullJob.attemptsMade,
      maxAttempts,
      willRetry,
      nextRetryMs: willRetry ? this.backoffService.calculateWaitMs(bullJob.attemptsMade) : null,
    });

    if (!willRetry) {
      try {
        const job = await this.jobModelAction.get({
          identifierOptions: { id: bullJob.data.jobId },
        });

        if (!job) return;

        await Promise.all([
          this.jobModelAction.update({
            identifierOptions: { id: job.id },
            updatePayload: {
              status: JobStatus.FAILED,
              error_message: error.message,
              lease_expires_at: null,
            },
            transactionOptions: { useTransaction: false },
          }),
          this.dlqService.moveToDlq({
            originalJobId: job.id,
            type: job.type,
            payload: job.payload,
            priority: job.priority,
            errorMessage: error.message,
            retryCount: bullJob.attemptsMade,
          }),
        ]);
        this.sseService.emit('job_failed', {
          id: job.id,
          status: JobStatus.FAILED,
          error: error.message,
        });
      } catch (dbErr) {
        this.logger.error({
          event: 'dlq_write_failed',
          jobId: bullJob.data.jobId,
          error: (dbErr as Error).message,
        });
      }
    } else {
      this.logger.warn({
        event: 'job_retry_scheduled',
        jobId: bullJob.data.jobId,
        attempt: bullJob.attemptsMade + 1,
        delayMs: this.backoffService.calculateWaitMs(bullJob.attemptsMade),
      });
    }
  }

  @OnQueueStalled()
  onStalled(bullJob: BullJob<WorkerJobData>): void {
    // Bull auto re-queues stalled jobs. The scheduler's recovery sweep detects the
    // expired lease and resets DB status to PENDING so the re-queued job can be claimed.
    this.logger.warn({
      event: 'job_bull_stalled',
      jobId: bullJob.data.jobId,
      bullJobId: bullJob.id,
      attemptsMade: bullJob.attemptsMade,
    });
  }
}
