import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JobsService } from './jobs.service';
import { SseService } from '../../sse/sse.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs.query.dto';
import * as SYS_MSG from '@constants/system-messages';
import {
  CreateJobDocs,
  ListJobsDocs,
  GetStatsDocs,
  GetJobDocs,
  CancelJobDocs,
  StreamEventsDocs,
} from './docs/jobs-swagger.doc';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly sseService: SseService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CreateJobDocs()
  async createJob(@Body() dto: CreateJobDto) {
    const data = await this.jobsService.createJob(dto);
    return { statusCode: HttpStatus.CREATED, message: SYS_MSG.JOB_CREATED, data };
  }

  @Get()
  @ListJobsDocs()
  async listJobs(@Query() query: ListJobsQueryDto) {
    const { payload, paginationMeta } = await this.jobsService.listJobs(query);
    return {
      statusCode: HttpStatus.OK,
      message: SYS_MSG.JOB_LIST_FETCHED,
      data: payload,
      ...(paginationMeta as Record<string, unknown>),
    };
  }

  @Get('stats')
  @GetStatsDocs()
  async getDashboardStats() {
    const data = await this.jobsService.getDashboardStats();
    return { statusCode: HttpStatus.OK, message: SYS_MSG.JOB_STATS_FETCHED, data };
  }

  @Get(':id')
  @GetJobDocs()
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.jobsService.getJob(id);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.JOB_FETCHED, data };
  }

  @Patch(':id/cancel')
  @CancelJobDocs()
  async cancelJob(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.jobsService.cancelJob(id);
    return { statusCode: HttpStatus.OK, message: SYS_MSG.JOB_CANCELLED_SUCCESS, data };
  }

  @Sse('events')
  @StreamEventsDocs()
  streamEvents(): Observable<MessageEvent> {
    return this.sseService.stream();
  }
}
