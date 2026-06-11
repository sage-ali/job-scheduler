import { Global, Module } from '@nestjs/common';
import { LoggerContextService } from './logger-context.service';
import { PinoLoggerService } from './pino-logger.service';

@Global()
@Module({
  providers: [LoggerContextService, PinoLoggerService],
  exports: [LoggerContextService, PinoLoggerService],
})
export class LoggerModule {}
