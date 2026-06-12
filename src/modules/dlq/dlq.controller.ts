import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DlqService } from './dlq.service';
import * as SYS_MSG from '@constants/system-messages';
import { ListDlqJobsDocs, RetryDlqJobDocs } from './docs/dlq-swagger.doc';

class ListDlqQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@ApiTags('DLQ')
@Controller('dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  @ListDlqJobsDocs()
  async listDlqJobs(@Query() query: ListDlqQueryDto) {
    const { data, ...paginationMeta } = await this.dlqService.listDlqJobs(query.page, query.limit);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.DLQ_LIST_FETCHED,
      data,
      ...paginationMeta,
    };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RetryDlqJobDocs()
  async retryDlqJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.dlqService.retryDlqJob(id);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.DLQ_RETRY_QUEUED, data };
  }
}
