import { SchedulerService } from '../scheduler.service';
import { JobModelAction } from '../../jobs/jobs.model-action';
import { JobsService } from '../../jobs/jobs.service';
import { JobStatus } from '../../jobs/enums/job-status.enum';
import type { Job } from '../../jobs/entities/job.entity';
import { JobType } from '../../jobs/enums/job-type.enum';
import { JobPriority } from '../../jobs/enums/job-priority.enum';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-uuid',
    type: JobType.SEND_EMAIL,
    payload: {},
    priority: JobPriority.MEDIUM,
    status: JobStatus.PENDING,
    scheduled_at: null,
    recurring_interval: null,
    depends_on: null,
    retry_count: 0,
    max_retries: 3,
    priority_score: 2,
    error_message: null,
    next_run_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date(Date.now() - 10 * 60_000), // 10 min ago (past starvation threshold)
    updated_at: new Date(),
    ...overrides,
  } as Job;
}

describe('SchedulerService', () => {
  let service: SchedulerService;
  let jobModelAction: jest.Mocked<JobModelAction>;
  let jobsService: jest.Mocked<JobsService>;

  beforeEach(() => {
    jobModelAction = {
      findEligibleJobs: jest.fn(),
      findJobsByIds: jest.fn(),
      findStarvingPendingJobs: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<JobModelAction>;

    jobsService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<JobsService>;

    service = new SchedulerService(jobModelAction, jobsService);
  });

  describe('runSchedulerSweep', () => {
    it('runs enqueue and boost in parallel and logs the result', async () => {
      jobModelAction.findEligibleJobs.mockResolvedValue([]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await expect(service.runSchedulerSweep()).resolves.toBeUndefined();

      expect(jobModelAction.findEligibleJobs).toHaveBeenCalled();
      expect(jobModelAction.findStarvingPendingJobs).toHaveBeenCalled();
    });
  });

  describe('enqueueReadyJobs (via runSchedulerSweep)', () => {
    it('returns 0 and skips enqueueing when no eligible jobs exist', async () => {
      jobModelAction.findEligibleJobs.mockResolvedValue([]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await service.runSchedulerSweep();

      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues jobs that have no dependencies', async () => {
      const job = makeJob({ depends_on: null });
      jobModelAction.findEligibleJobs.mockResolvedValue([job]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await service.runSchedulerSweep();

      expect(jobsService.enqueue).toHaveBeenCalledWith(job);
    });

    it('enqueues a job whose dependencies are all completed', async () => {
      const dep = makeJob({ id: 'dep-uuid', status: JobStatus.COMPLETED });
      const job = makeJob({ id: 'child-uuid', depends_on: ['dep-uuid'] });
      jobModelAction.findEligibleJobs.mockResolvedValue([job]);
      jobModelAction.findJobsByIds.mockResolvedValue([dep]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await service.runSchedulerSweep();

      expect(jobsService.enqueue).toHaveBeenCalledWith(job);
    });

    it('skips a job whose dependency is not yet completed', async () => {
      const dep = makeJob({ id: 'dep-uuid', status: JobStatus.PENDING });
      const job = makeJob({ id: 'child-uuid', depends_on: ['dep-uuid'] });
      jobModelAction.findEligibleJobs.mockResolvedValue([job]);
      jobModelAction.findJobsByIds.mockResolvedValue([dep]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await service.runSchedulerSweep();

      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('boostStarvingJobs (via runSchedulerSweep)', () => {
    it('returns 0 when no starving jobs exist', async () => {
      jobModelAction.findEligibleJobs.mockResolvedValue([]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([]);

      await service.runSchedulerSweep();

      expect(jobModelAction.update).not.toHaveBeenCalled();
    });

    it('decreases priority_score for starving jobs', async () => {
      const job = makeJob({ priority_score: 2, created_at: new Date(Date.now() - 10 * 60_000) });
      jobModelAction.findEligibleJobs.mockResolvedValue([]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([job]);
      jobModelAction.update.mockResolvedValue(job);

      await service.runSchedulerSweep();

      const updateCall = jobModelAction.update.mock.calls[0][0];
      expect(updateCall.updatePayload.priority_score).toBeLessThan(2);
    });

    it('floors priority_score at 0 for very long-waiting jobs', async () => {
      // job waiting 1000 minutes: boost = 0.1 * 1000 = 100, well above current score of 2
      const job = makeJob({
        priority_score: 2,
        created_at: new Date(Date.now() - 1000 * 60_000),
      });
      jobModelAction.findEligibleJobs.mockResolvedValue([]);
      jobModelAction.findStarvingPendingJobs.mockResolvedValue([job]);
      jobModelAction.update.mockResolvedValue(job);

      await service.runSchedulerSweep();

      const updateCall = jobModelAction.update.mock.calls[0][0];
      expect(updateCall.updatePayload.priority_score).toBe(0);
    });
  });
});
