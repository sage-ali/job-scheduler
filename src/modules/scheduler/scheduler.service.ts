import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobModelAction } from '../jobs/jobs.model-action';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus } from '../jobs/enums/job-status.enum';
import { HeapPriorityQueue } from './heap';

const STARVATION_THRESHOLD_MS = 5 * 60_000;
const SCORE_BOOST_PER_MINUTE = 0.1;
const SWEEP_BATCH_SIZE = 50;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly jobModelAction: JobModelAction,
    private readonly jobsService: JobsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runSchedulerSweep(): Promise<void> {
    // Recovery runs first so reset-to-PENDING jobs are immediately eligible for enqueuing.
    const recovered = await this.recoverStalledJobs();

    const [enqueued, boosted] = await Promise.allSettled([
      this.enqueueReadyJobs(),
      this.boostStarvingJobs(),
    ]);

    this.logger.log({
      event: 'scheduler_sweep_complete',
      recovered,
      enqueued: enqueued.status === 'fulfilled' ? enqueued.value : 0,
      boosted: boosted.status === 'fulfilled' ? boosted.value : 0,
    });
  }

  private async enqueueReadyJobs(): Promise<number> {
    try {
      const jobs = await this.jobModelAction.findEligibleJobs(SWEEP_BATCH_SIZE);
      if (jobs.length === 0) return 0;

      this.logger.log({ event: 'scheduler_enqueue_batch', count: jobs.length });

      const heap = new HeapPriorityQueue();
      const jobMap = new Map(jobs.map((j) => [j.id, j]));

      for (const job of jobs) {
        heap.insert({
          score: job.priority_score,
          scheduledAt: job.scheduled_at,
          createdAt: job.created_at,
          jobId: job.id,
        });
      }

      let enqueued = 0;
      while (heap.size() > 0) {
        const node = heap.popMin()!;
        const job = jobMap.get(node.jobId)!;

        try {
          if (job.depends_on && job.depends_on.length > 0) {
            const deps = await this.jobModelAction.findJobsByIds(job.depends_on);

            const terminal = deps.filter(
              (d) => d.status === JobStatus.FAILED || d.status === JobStatus.CANCELLED,
            );
            if (terminal.length > 0) {
              // A terminated dependency can never complete — cascade-fail this job immediately.
              await this.jobModelAction.update({
                identifierOptions: { id: job.id },
                updatePayload: {
                  status: JobStatus.FAILED,
                  started_at: new Date(),
                  completed_at: new Date(),
                },
                transactionOptions: { useTransaction: false },
              });
              this.logger.warn({
                event: 'scheduler_dag_cascade_fail',
                jobId: job.id,
                terminalDepIds: terminal.map((d) => d.id),
              });
              continue;
            }

            const unmet = deps.filter((d) => d.status !== JobStatus.COMPLETED);
            if (unmet.length > 0) {
              this.logger.log({
                event: 'scheduler_skip_dag_unmet',
                jobId: job.id,
                unmetCount: unmet.length,
              });
              continue;
            }
          }

          await this.jobsService.enqueue(job);
          enqueued++;
        } catch (err) {
          this.logger.error({
            event: 'scheduler_enqueue_job_failed',
            jobId: job.id,
            error: (err as Error).message,
          });
        }
      }

      return enqueued;
    } catch (err) {
      this.logger.error({
        event: 'scheduler_enqueue_sweep_failed',
        error: (err as Error).message,
      });
      return 0;
    }
  }

  private async boostStarvingJobs(): Promise<number> {
    try {
      const starvingJobs = await this.jobModelAction.findStarvingPendingJobs(
        STARVATION_THRESHOLD_MS,
        SWEEP_BATCH_SIZE,
      );

      if (starvingJobs.length === 0) return 0;

      await Promise.all(
        starvingJobs.map(async (job) => {
          const minutesWaiting = (Date.now() - job.created_at.getTime()) / 60_000;
          const newScore = Math.max(
            0,
            job.priority_score - SCORE_BOOST_PER_MINUTE * minutesWaiting,
          );

          await this.jobModelAction.update({
            identifierOptions: { id: job.id },
            updatePayload: { priority_score: newScore },
            transactionOptions: { useTransaction: false },
          });
        }),
      );

      this.logger.log({ event: 'starvation_boost_applied', count: starvingJobs.length });
      return starvingJobs.length;
    } catch (err) {
      this.logger.error({ event: 'starvation_boost_failed', error: (err as Error).message });
      return 0;
    }
  }

  private async recoverStalledJobs(): Promise<number> {
    try {
      const stalled = await this.jobModelAction.findStalledJobs(SWEEP_BATCH_SIZE);
      if (stalled.length === 0) return 0;

      await Promise.all(
        stalled.map(async (job) => {
          await this.jobModelAction.update({
            identifierOptions: { id: job.id },
            updatePayload: { status: JobStatus.PENDING, started_at: null, lease_expires_at: null },
            transactionOptions: { useTransaction: false },
          });
          this.logger.warn({
            event: 'job_stall_recovered',
            jobId: job.id,
            stalledSince: job.started_at,
            leaseExpiredAt: job.lease_expires_at,
          });
        }),
      );

      return stalled.length;
    } catch (err) {
      this.logger.error({ event: 'stall_recovery_failed', error: (err as Error).message });
      return 0;
    }
  }
}
