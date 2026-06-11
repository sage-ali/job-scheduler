import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { env } from './config/env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGIN });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Job Scheduler API')
      .setDescription('Distributed job scheduling service with Bull + Redis')
      .setVersion('1.0')
      .addTag('jobs')
      .addTag('dlq')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(env.PORT);
  // eslint-disable-next-line no-console
  console.log(`Application running on http://localhost:${env.PORT}`);
  if (env.SWAGGER_ENABLED) {
    // eslint-disable-next-line no-console
    console.log(`Swagger docs at http://localhost:${env.PORT}/api/docs`);
  }
}

void bootstrap();
