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
import { DlqJobDto, RetryResponseDto } from './dlq-response.dto';

// ---------------------------------------------------------------------------
// Reusable error shapes
// ---------------------------------------------------------------------------

const errorSchema = (statusCode: HttpStatus, error: string, message: string) => ({
  example: {
    success: false,
    statusCode,
    error,
    message,
    path: '/api/v1/dlq',
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

// ---------------------------------------------------------------------------
// Endpoint decorators
// ---------------------------------------------------------------------------

export function ListDlqJobsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'List all dead-letter queue entries',
      description:
        'Returns all jobs that exhausted their retry budget. Entries are ordered by `created_at DESC` ' +
        '(most recently failed first). Use the `POST /dlq/:id/retry` endpoint to re-enqueue an entry.',
    }),
    ApiExtraModels(DlqJobDto),
    ApiOkResponse({
      description: SYS_MSG.DLQ_LIST_FETCHED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.DLQ_LIST_FETCHED },
          data: { type: 'array', items: { $ref: getSchemaPath(DlqJobDto) } },
        },
      },
    }),
    CommonErrorResponses(),
  );
}

export function RetryDlqJobDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Re-enqueue a DLQ job for retry',
      description:
        'Creates a fresh `pending` job from the DLQ entry with the same type, payload, and priority, ' +
        'then deletes the DLQ record. The new job gets a full retry budget (`max_retries`). ' +
        'If it fails again, it will land back in the DLQ.',
    }),
    ApiParam({ name: 'id', format: 'uuid', description: 'DLQ entry UUID' }),
    ApiExtraModels(RetryResponseDto),
    ApiOkResponse({
      description: SYS_MSG.DLQ_RETRY_QUEUED,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: HttpStatus.OK },
          message: { type: 'string', example: SYS_MSG.DLQ_RETRY_QUEUED },
          data: { $ref: getSchemaPath(RetryResponseDto) },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'DLQ entry not found',
      schema: errorSchema(HttpStatus.NOT_FOUND, 'Not Found', SYS_MSG.DLQ_JOB_NOT_FOUND('<id>')),
    }),
    CommonErrorResponses(),
  );
}
