import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import * as SYS_MSG from '@constants/system-messages';
import { JobDto, PaginationMetaDto, DashboardStatsDto } from './job-response.dto';

// ---------------------------------------------------------------------------
// Reusable error shapes
// ---------------------------------------------------------------------------

const errorSchema = (statusCode: HttpStatus, error: string, message: string | string[]) => ({
  example: {
    success: false,
    statusCode,
    error,
    message,
    path: '/api/v1/jobs',
    timestamp: '2026-06-11T22:14:10.000Z',
  },
});

const CommonErrorResponses = () =>
  applyDecorators(
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'Unexpected server error',
      schema: errorSchema(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Internal Server Error',
        SYS_MSG.HTTP_INTERNAL_SERVER_ERROR,
      ),
    }),
  );

const ValidationErrorResponse = () =>
  ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request body or query params failed validation',
    schema: errorSchema(HttpStatus.BAD_REQUEST, 'Bad Request', [
      'type must be one of the following values: send_email, webhook_delivery, log_processing',
      'payload must be an object',
    ]),
  });

const NotFoundResponse = (resource: string) =>
  ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: `${resource} not found`,
    schema: errorSchema(HttpStatus.NOT_FOUND, 'Not Found', `${resource} <id> not found`),
  });

// ---------------------------------------------------------------------------
// Endpoint decorators
// ---------------------------------------------------------------------------

export function CreateJobDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new job',
      description:
        'Creates a job and (if it has no `scheduled_at` and no `depends_on`) enqueues it ' +
        'into Bull immediately. Scheduled jobs are held until the scheduler sweep picks them up. ' +
        'Jobs with `depends_on` are held until all listed jobs reach `completed` status.',
    }),
    ApiExtraModels(JobDto),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: SYS_MSG.JOB_CREATED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.CREATED },
          message: { type: 'string', example: SYS_MSG.JOB_CREATED },
          data: { $ref: getSchemaPath(JobDto) },
        },
      },
    }),
    ValidationErrorResponse(),
    CommonErrorResponses(),
  );
}

export function ListJobsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'List jobs with optional filters and pagination',
      description:
        'Returns a paginated list of jobs. Filter by `status`, `type`, or `priority`. ' +
        'Results are ordered by `priority_score ASC, created_at ASC` — lowest score (highest urgency) first.',
    }),
    ApiExtraModels(JobDto, PaginationMetaDto),
    ApiOkResponse({
      description: SYS_MSG.JOB_LIST_FETCHED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.JOB_LIST_FETCHED },
          data: { type: 'array', items: { $ref: getSchemaPath(JobDto) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
    ValidationErrorResponse(),
    CommonErrorResponses(),
  );
}

export function GetStatsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get job counts by status',
      description:
        'Returns a real-time count of all jobs broken down by status. ' +
        'Useful for a dashboard overview panel. Executes a GROUP BY query — no cache.',
    }),
    ApiExtraModels(DashboardStatsDto),
    ApiOkResponse({
      description: SYS_MSG.JOB_STATS_FETCHED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.JOB_STATS_FETCHED },
          data: { $ref: getSchemaPath(DashboardStatsDto) },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function GetJobDocs() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a job by ID' }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Job UUID' }),
    ApiExtraModels(JobDto),
    ApiOkResponse({
      description: SYS_MSG.JOB_FETCHED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.JOB_FETCHED },
          data: { $ref: getSchemaPath(JobDto) },
        },
      },
    }),
    NotFoundResponse('Job'),
    CommonErrorResponses(),
  );
}

export function CancelJobDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Cancel a job',
      description:
        'Marks the job as `cancelled`. If the job is `pending`, it is also removed from the Bull queue ' +
        'to prevent a race condition where the worker picks it up after the DB update. ' +
        'Returns 409 if the job is currently `processing`. ' +
        'Returns 400 if the job is already `completed`, `failed`, or `cancelled`.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'Job UUID' }),
    ApiExtraModels(JobDto),
    ApiOkResponse({
      description: SYS_MSG.JOB_CANCELLED_SUCCESS,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.JOB_CANCELLED_SUCCESS },
          data: { $ref: getSchemaPath(JobDto) },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'Job is currently being processed',
      schema: errorSchema(HttpStatus.CONFLICT, 'Conflict', SYS_MSG.JOB_ALREADY_PROCESSING),
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Job is in a terminal state and cannot be cancelled',
      schema: errorSchema(
        HttpStatus.BAD_REQUEST,
        'Bad Request',
        SYS_MSG.JOB_CANNOT_BE_CANCELLED('completed'),
      ),
    }),
    NotFoundResponse('Job'),
    CommonErrorResponses(),
  );
}

export function StreamEventsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Stream live job status events (SSE)',
      description:
        'Server-Sent Events stream that emits job lifecycle events in real time. ' +
        'Connect with `EventSource` — each event has a `type` (e.g. `job.completed`) and a `data` payload. ' +
        '**Note:** This endpoint is a stub; SSE wiring is implemented in Phase 4.',
    }),
    ApiResponse({
      status: 200,
      description: 'SSE stream (text/event-stream)',
      content: {
        'text/event-stream': {
          schema: {
            type: 'string',
            example: 'data: {"type":"job.completed","jobId":"b3d4c1e9-..."}\n\n',
          },
        },
      },
    }),
  );
}
