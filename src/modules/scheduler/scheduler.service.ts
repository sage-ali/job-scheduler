import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobModelAction } from '../jobs/jobs.model-action';
import { JobsService } from '../jobs/jobs.service';
import { JobStatus } from '../jobs/enums/job-status.enum';
import { RECURRING_INTERVAL_MS } from '../jobs/enums/job-type.enum';

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
    const [enqueued, boosted] = await Promise.allSettled([
      this.enqueueReadyJobs(),
      this.boostStarvingJobs(),
    ]);

    this.logger.log({
      event: 'scheduler_sweep_complete',
      enqueued: enqueued.status === 'fulfilled' ? enqueued.value : 0,
      boosted: boosted.status === 'fulfilled' ? boosted.value : 0,
    });
  }

  private async enqueueReadyJobs(): Promise<number> {
    try {
      const jobs = await this.jobModelAction.findEligibleJobs(SWEEP_BATCH_SIZE);
      if (jobs.length === 0) return 0;

      this.logger.log({ event: 'scheduler_enqueue_batch', count: jobs.length });

      for (const job of jobs) {
        if (job.depends_on && job.depends_on.length > 0) {
          const deps = await this.jobModelAction.findJobsByIds(job.depends_on);
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
      }

      return jobs.length;
    } catch (err) {
      this.logger.error({
        event: 'scheduler_enqueue_sweep_failed',
        error: (err as Error).message,
      });
      return 0;
    }
  }

  private async boostStarvingJobs(): Promise<number> {
    return 0;
  }

  async scheduleNextRun(jobId: string): Promise<void> {
    const job = await this.jobModelAction.get({ identifierOptions: { id: jobId } });
    if (!job?.recurring_interval) return;

    const intervalMs = RECURRING_INTERVAL_MS[job.recurring_interval];
    const nextAt = new Date(Date.now() + intervalMs);

    await this.jobsService.createJob({
      type: job.type as never,
      payload: job.payload,
      priority: job.priority as never,
      recurring_interval: job.recurring_interval,
      scheduled_at: nextAt.toISOString(),
    });

    this.logger.log({
      event: 'recurring_job_rescheduled',
      originalJobId: jobId,
      interval: job.recurring_interval,
      nextAt,
    });
  }
}
