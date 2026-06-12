import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { redisConfig } from './config/redis.config';
import { env } from './config/env';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './modules/redis/redis.module';
import { JobsQueueModule } from './queue/jobs-queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [redisConfig] }),
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      username: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
      autoLoadEntities: true,
      synchronize: false,
      logging: env.DATABASE_LOGGING,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    }),
    LoggerModule,
    RedisModule,
    JobsQueueModule,
  ],
})
export class WorkerModule {}
