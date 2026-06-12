import { HttpStatus } from '@nestjs/common';
import { DlqService } from '../dlq.service';
import { JobsService } from '../../jobs/jobs.service';
import { EmailSimulationHandler } from '@queue/handlers/email-simulation.handler';
import type { Repository } from 'typeorm';
import type { DlqJob } from '../entities/dlq-job.entity';
import type { Job } from '../../jobs/entities/job.entity';
import { JobType } from '../../jobs/enums/job-type.enum';
import { JobPriority } from '../../jobs/enums/job-priority.enum';

function makeDlqJob(overrides: Partial<DlqJob> = {}): DlqJob {
  return {
    id: 'dlq-uuid',
    original_job_id: 'job-uuid',
    type: JobType.SEND_EMAIL,
    payload: { to: 'a@b.com', subject: 'Hi' },
    priority: JobPriority.MEDIUM,
    error_message: 'Simulated failure',
    retry_count: 3,
    last_attempted_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as DlqJob;
}

describe('DlqService', () => {
  let service: DlqService;
  let repo: jest.Mocked<Repository<DlqJob>>;
  let jobsService: jest.Mocked<JobsService>;
  let emailHandler: jest.Mocked<EmailSimulationHandler>;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<DlqJob>>;

    jobsService = { createJob: jest.fn() } as unknown as jest.Mocked<JobsService>;
    emailHandler = {
      handle: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailSimulationHandler>;

    const sseService = {
      emit: jest.fn(),
    } as unknown as import('../../../sse/sse.service').SseService;
    service = new DlqService(repo, jobsService, emailHandler, sseService);
  });

  describe('moveToDlq', () => {
    const params = {
      originalJobId: 'job-uuid',
      type: JobType.SEND_EMAIL,
      payload: { to: 'a@b.com', subject: 'Hi' },
      priority: JobPriority.MEDIUM,
      errorMessage: 'Simulated failure',
      retryCount: 3,
    };

    it('creates and saves a DLQ entry', async () => {
      const entry = makeDlqJob();
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);
      repo.count.mockResolvedValue(1);

      const result = await service.moveToDlq(params);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ original_job_id: 'job-uuid' }),
      );
      expect(repo.save).toHaveBeenCalledWith(entry);
      expect(result).toBe(entry);
    });

    it('does not send alert email when count is below threshold', async () => {
      const entry = makeDlqJob();
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);
      repo.count.mockResolvedValue(1); // well below default threshold of 10

      await service.moveToDlq(params);

      expect(emailHandler.handle).not.toHaveBeenCalled();
    });

    it('sends alert email when count reaches the threshold', async () => {
      const entry = makeDlqJob();
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);
      repo.count.mockResolvedValue(10); // default DLQ_ALERT_THRESHOLD is 10

      await service.moveToDlq(params);

      expect(emailHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ to: expect.any(String), subject: expect.any(String) }),
      );
    });

    it('skips alert email gracefully when emailHandler is not provided', async () => {
      const serviceWithoutEmail = new DlqService(
        repo,
        jobsService,
        undefined as unknown as EmailSimulationHandler,
        undefined as unknown as import('../../../sse/sse.service').SseService,
      );
      const entry = makeDlqJob();
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);
      repo.count.mockResolvedValue(10);

      await expect(serviceWithoutEmail.moveToDlq(params)).resolves.not.toThrow();
    });
  });

  describe('listDlqJobs', () => {
    it('returns all DLQ entries ordered by created_at DESC', async () => {
      const jobs = [makeDlqJob(), makeDlqJob({ id: 'dlq-2' })];
      repo.find.mockResolvedValue(jobs);

      const result = await service.listDlqJobs();

      expect(repo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
      expect(result).toBe(jobs);
    });
  });

  describe('retryDlqJob', () => {
    it('throws 404 when the DLQ entry is not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.retryDlqJob('dlq-uuid')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('throws 500 when jobsService is not available', async () => {
      const serviceWithoutJobs = new DlqService(
        repo,
        undefined as unknown as JobsService,
        emailHandler,
        undefined as unknown as import('../../../sse/sse.service').SseService,
      );
      repo.findOne.mockResolvedValue(makeDlqJob());

      await expect(serviceWithoutJobs.retryDlqJob('dlq-uuid')).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('creates a new job, deletes the DLQ entry, and returns the new job id', async () => {
      const dlqJob = makeDlqJob();
      const newJob = { id: 'new-job-uuid' } as Job;
      repo.findOne.mockResolvedValue(dlqJob);
      jobsService.createJob.mockResolvedValue(newJob);
      repo.delete.mockResolvedValue({ affected: 1, raw: [] });

      const result = await service.retryDlqJob('dlq-uuid');

      expect(jobsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: dlqJob.type }),
      );
      expect(repo.delete).toHaveBeenCalledWith('dlq-uuid');
      expect(result).toEqual({ jobId: 'new-job-uuid' });
    });
  });
});
