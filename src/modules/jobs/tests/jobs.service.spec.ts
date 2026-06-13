import { HttpStatus } from '@nestjs/common';
import { JobsService } from '../jobs.service';
import { JobModelAction } from '../jobs.model-action';
import { JobStatus } from '../enums/job-status.enum';
import { JobType } from '../enums/job-type.enum';
import { JobPriority } from '../enums/job-priority.enum';
import type { Job } from '../entities/job.entity';
import type { Queue } from 'bull';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-uuid',
    type: JobType.SEND_EMAIL,
    payload: { to: 'a@b.com', subject: 'Hi' },
    priority: JobPriority.MEDIUM,
    status: JobStatus.PENDING,
    scheduled_at: null,
    recurring_interval: null,
    next_run_at: null,
    depends_on: null,
    retry_count: 0,
    max_retries: 3,
    priority_score: 2,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Job;
}

describe('JobsService', () => {
  let service: JobsService;
  let jobModelAction: jest.Mocked<JobModelAction>;
  let jobsQueue: jest.Mocked<Pick<Queue, 'add' | 'getJob'>>;

  beforeEach(() => {
    jobModelAction = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      countByStatus: jest.fn(),
      findJobsByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<JobModelAction>;

    jobsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull-1' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    const sseService = {
      emit: jest.fn(),
    } as unknown as import('../../../sse/sse.service').SseService;
    service = new JobsService(jobModelAction, jobsQueue as unknown as Queue, sseService);
  });

  describe('createJob', () => {
    it('persists the job and enqueues it immediately when no scheduled_at or depends_on', async () => {
      const job = makeJob();
      jobModelAction.create.mockResolvedValue(job);

      const result = await service.createJob({
        type: JobType.SEND_EMAIL,
        payload: { to: 'a@b.com', subject: 'Hi' },
        priority: JobPriority.MEDIUM,
      });

      expect(jobModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createPayload: expect.objectContaining({ status: JobStatus.PENDING }),
        }),
      );
      expect(jobsQueue.add).toHaveBeenCalledTimes(1);
      expect(result).toBe(job);
    });

    it('does NOT enqueue when scheduled_at is in the future', async () => {
      const future = new Date(Date.now() + 60_000);
      const job = makeJob({ scheduled_at: future });
      jobModelAction.create.mockResolvedValue(job);

      await service.createJob({
        type: JobType.SEND_EMAIL,
        payload: { to: 'a@b.com', subject: 'Hi' },
        scheduled_at: future.toISOString(),
      });

      expect(jobsQueue.add).not.toHaveBeenCalled();
    });

    it('does NOT enqueue when job has unresolved dependencies', async () => {
      const job = makeJob({ depends_on: ['dep-uuid'] });
      jobModelAction.create.mockResolvedValue(job);

      await service.createJob({
        type: JobType.SEND_EMAIL,
        payload: { to: 'a@b.com', subject: 'Hi' },
        depends_on: ['dep-uuid'],
      });

      expect(jobsQueue.add).not.toHaveBeenCalled();
    });

    it('defaults priority to 2 when not provided', async () => {
      const job = makeJob();
      jobModelAction.create.mockResolvedValue(job);

      await service.createJob({ type: JobType.SEND_EMAIL, payload: {} });

      expect(jobModelAction.create).toHaveBeenCalledWith(
        expect.objectContaining({ createPayload: expect.objectContaining({ priority: 2 }) }),
      );
    });
  });

  describe('getJob', () => {
    it('returns the job when found', async () => {
      const job = makeJob();
      jobModelAction.get.mockResolvedValue(job);

      await expect(service.getJob('job-uuid')).resolves.toBe(job);
    });

    it('throws 404 when job is not found', async () => {
      jobModelAction.get.mockResolvedValue(null);

      await expect(service.getJob('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('cancelJob', () => {
    it('cancels a PENDING job and removes it from Bull', async () => {
      const bullJob = { remove: jest.fn().mockResolvedValue(undefined) };
      jobsQueue.getJob = jest.fn().mockResolvedValue(bullJob);
      const job = makeJob({ status: JobStatus.PENDING });
      jobModelAction.get.mockResolvedValue(job);
      jobModelAction.update.mockResolvedValue({ ...job, status: JobStatus.CANCELLED } as Job);

      const result = await service.cancelJob('job-uuid');

      expect(bullJob.remove).toHaveBeenCalled();
      expect(jobModelAction.update).toHaveBeenCalledWith(
        expect.objectContaining({ updatePayload: { status: JobStatus.CANCELLED } }),
      );
      expect(result.status).toBe(JobStatus.CANCELLED);
    });

    it('throws 409 when job is currently PROCESSING', async () => {
      jobModelAction.get.mockResolvedValue(makeJob({ status: JobStatus.PROCESSING }));

      await expect(service.cancelJob('job-uuid')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(jobsQueue.getJob).not.toHaveBeenCalled();
    });

    it('throws 400 when cancelling a COMPLETED job', async () => {
      jobModelAction.get.mockResolvedValue(makeJob({ status: JobStatus.COMPLETED }));

      await expect(service.cancelJob('job-uuid')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('throws 400 when cancelling a FAILED job', async () => {
      jobModelAction.get.mockResolvedValue(makeJob({ status: JobStatus.FAILED }));

      await expect(service.cancelJob('job-uuid')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('still cancels in DB if Bull removal throws', async () => {
      const bullJob = { remove: jest.fn().mockRejectedValue(new Error('already active')) };
      jobsQueue.getJob = jest.fn().mockResolvedValue(bullJob);
      const job = makeJob({ status: JobStatus.PENDING });
      jobModelAction.get.mockResolvedValue(job);
      jobModelAction.update.mockResolvedValue({ ...job, status: JobStatus.CANCELLED } as Job);

      await expect(service.cancelJob('job-uuid')).resolves.toMatchObject({
        status: JobStatus.CANCELLED,
      });
    });
  });

  describe('getDashboardStats', () => {
    it('delegates to countByStatus', async () => {
      const counts = {
        pending: 3,
        processing: 1,
        completed: 10,
        failed: 2,
        cancelled: 0,
      } as Record<JobStatus, number>;
      jobModelAction.countByStatus.mockResolvedValue(counts);

      const result = await service.getDashboardStats();

      expect(result).toBe(counts);
      expect(jobModelAction.countByStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('enqueue', () => {
    it('passes max_retries as attempts to Bull', async () => {
      const job = makeJob({ max_retries: 5 });
      await service.enqueue(job);

      expect(jobsQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { jobId: job.id },
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it('adds a positive delay for jobs with future scheduled_at', async () => {
      const future = new Date(Date.now() + 60_000);
      const job = makeJob({ scheduled_at: future });
      await service.enqueue(job);

      const opts = (jobsQueue.add as jest.Mock).mock.calls[0][2];
      expect(opts.delay).toBeGreaterThan(0);
    });

    it('omits delay for jobs with no scheduled_at', async () => {
      const job = makeJob({ scheduled_at: null });
      await service.enqueue(job);

      const opts = (jobsQueue.add as jest.Mock).mock.calls[0][2];
      expect(opts.delay).toBeUndefined();
    });
  });
});
