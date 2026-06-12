import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });

  // Wire Pino as the NestJS logger. This also flushes any logs that were
  // buffered during createApplicationContext initialisation.
  app.useLogger(app.get(PinoLoggerService));

  app.enableShutdownHooks();
}

void bootstrap();
