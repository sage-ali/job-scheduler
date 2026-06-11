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
import { JOBS, QUEUES, WORKER_LOCK } from '@common/constants/queue.constants';
import { JobModelAction } from '@modules/jobs/jobs.model-action';
import { DlqService } from '@modules/dlq/dlq.service';
import { RedisService } from '@modules/redis/redis.service';
import { JobStatus } from '@modules/jobs/enums/job-status.enum';
import { JobType, RECURRING_INTERVAL_MS } from '@modules/jobs/enums/job-type.enum';
import { Job } from '@modules/jobs/entities/job.entity';
import { EmailSimulationHandler } from '../handlers/email-simulation.handler';
import type { SendEmailPayload } from '@modules/jobs/interfaces/job-payload.interface';
import { BackoffService } from '@worker/backoff.service';
import { randomUUID } from 'crypto';

interface WorkerJobData {
  jobId: string;
}

@Processor(QUEUES.JOBS)
export class JobWorkerProcessor {
  private readonly logger = new Logger(JobWorkerProcessor.name);

  constructor(
    private readonly jobModelAction: JobModelAction,
    private readonly dlqService: DlqService,
    private readonly redisService: RedisService,
    private readonly emailHandler: EmailSimulationHandler,
    private readonly backoffService: BackoffService,
  ) {}

  @Process(JOBS.PROCESS_JOB)
  async handleJob(bullJob: BullJob<WorkerJobData>): Promise<void> {
    const { jobId } = bullJob.data;

    const lockKey = `${WORKER_LOCK.KEY_PREFIX}${jobId}`;
    const lockToken = randomUUID();
    const acquired = await this.redisService.setNx(lockKey, lockToken, WORKER_LOCK.TTL_SECONDS);
    if (!acquired) {
      this.logger.warn({
        event: 'job_lock_contention',
        jobId,
        bullJobId: bullJob.id,
      });
      return;
    }

    try {
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

      await this.jobModelAction.update({
        identifierOptions: { id: jobId },
        updatePayload: {
          status: JobStatus.PROCESSING,
          started_at: new Date(),
        },
        transactionOptions: { useTransaction: false },
      });

      await this.dispatch(job.type as JobType, job.payload);

      await this.jobModelAction.update({
        identifierOptions: { id: jobId },
        updatePayload: {
          status: JobStatus.COMPLETED,
          completed_at: new Date(),
        },
        transactionOptions: { useTransaction: false },
      });

      if (job.recurring_interval) {
        await this.scheduleNextRecurrence(job);
      }

      this.logger.log({ event: 'job_completed', jobId, type: job.type });
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
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
        throw new Error('webhook_delivery handler not yet implemented');
      case JobType.LOG_PROCESSING:
        throw new Error('log_processing handler not yet implemented');
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
    // Bull auto re-queues stalled jobs — DB status must not be changed here.
    this.logger.warn({
      event: 'job_bull_stalled',
      jobId: bullJob.data.jobId,
      bullJobId: bullJob.id,
      attemptsMade: bullJob.attemptsMade,
    });
  }
}
