import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { DlqService } from './dlq.service';

@Controller('dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  listDlqJobs() {
    return this.dlqService.listDlqJobs();
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retryDlqJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlqService.retryDlqJob(id);
  }
}
