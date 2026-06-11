import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs.query.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createJob(@Body() dto: CreateJobDto) {
    return this.jobsService.createJob(dto);
  }

  @Get()
  listJobs(@Query() query: ListJobsQueryDto) {
    return this.jobsService.listJobs(query);
  }

  @Get('stats')
  getDashboardStats() {
    return this.jobsService.getDashboardStats();
  }

  @Get(':id')
  getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.getJob(id);
  }

  @Patch(':id/cancel')
  cancelJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.cancelJob(id);
  }

  // TODO: implement one of SSE / WebSocket / polling for live updates.
  // SSE stub — replace Observable<never> with a real event stream from
  // an EventEmitter2 or Subject that JobsService publishes to.
  @Sse('events')
  streamEvents(): Observable<never> {
    throw new Error('SSE not yet implemented');
  }
}
