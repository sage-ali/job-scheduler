import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DlqService } from './dlq.service';
import * as SYS_MSG from '@constants/system-messages';
import { ListDlqJobsDocs, RetryDlqJobDocs } from './docs/dlq-swagger.doc';

@ApiTags('DLQ')
@Controller('dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  @ListDlqJobsDocs()
  async listDlqJobs() {
    const data = await this.dlqService.listDlqJobs();
    return { statusCode: HttpStatus.OK, message: SYS_MSG.DLQ_LIST_FETCHED, data };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RetryDlqJobDocs()
  async retryDlqJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.dlqService.retryDlqJob(id);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.DLQ_RETRY_QUEUED, data };
  }
}
