import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import { redisConfig } from '@config/redis.config';
import * as SYS_MSG from '@constants/system-messages';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  onModuleInit() {
    const { host, port, password, username } = redisConfig();

    const options: RedisOptions = {
      host,
      port: port ? Number(port) : 6379,
      ...(password && { password }),
      ...(username && { username }),
      connectTimeout: 5000,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => {
        if (times > 5) {
          this.logger.error(SYS_MSG.REDIS_RETRY_LIMIT_REACHED);
          return null;
        }
        const delay = Math.min(times * 200, 2000);
        this.logger.warn(SYS_MSG.REDIS_RECONNECT_ATTEMPT(times, delay));
        return delay;
      },
    };

    this.client = new Redis(options);

    this.client.on('connect', () => this.logger.log(SYS_MSG.REDIS_CONNECTION_ESTABLISHED));
    this.client.on('ready', () => this.logger.log(SYS_MSG.REDIS_CLIENT_READY));
    this.client.on('close', () => this.logger.warn(SYS_MSG.REDIS_CONNECTION_CLOSED));
    this.client.on('error', (err: Error) => {
      if (err.message.includes('OOM')) {
        this.logger.error(SYS_MSG.REDIS_CRITICAL_OOM, err.message);
      } else {
        this.logger.error(SYS_MSG.REDIS_CLIENT_ERROR, err.message);
      }
    });

    this.client.connect().catch((err) => {
      this.logger.error(SYS_MSG.REDIS_INITIAL_CONNECTION_FAILED, (err as Error).message);
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.error(`GET failed`, (err as Error).message);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.set(key, value, 'EX', ttl);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.error(`SET failed`, (err as Error).message);
    }
  }

  async setStrict(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
      return;
    }
    await this.client.set(key, value);
  }

  // Returns true only if the key did not exist — used for distributed locking.
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.error(`SET NX failed`, (err as Error).message);
      return false;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.error(`DEL failed`, (err as Error).message);
    }
  }

  // Releases a lock only if the stored token matches — prevents an expired lock
  // holder from deleting a later holder's lock.
  async releaseLock(key: string, token: string): Promise<void> {
    try {
      const current = await this.client.get(key);
      if (current === token) {
        await this.client.del(key);
      }
    } catch (err) {
      this.logger.error(`releaseLock failed`, (err as Error).message);
    }
  }

  async getdel(key: string): Promise<string | null> {
    try {
      return await this.client.getdel(key);
    } catch (err) {
      this.logger.error(`GETDEL failed`, (err as Error).message);
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (err) {
      this.logger.error(`EXISTS failed`, (err as Error).message);
      return false;
    }
  }

  async incr(key: string): Promise<number | null> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.logger.error(`INCR failed`, (err as Error).message);
      return null;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (err) {
      this.logger.error(`EXPIRE failed`, (err as Error).message);
    }
  }

  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ count: number; exceeded: boolean }> {
    try {
      await this.client.set(key, '0', 'EX', windowSeconds, 'NX');
      const count = await this.client.incr(key);
      return { count, exceeded: count > limit };
    } catch (err) {
      this.logger.error(`rateLimit failed`, (err as Error).message);
      return { count: 0, exceeded: false };
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        await this.client.del(...keysToDelete);
        this.logger.log(SYS_MSG.REDIS_PATTERN_DELETE_SUCCESS(keysToDelete.length, pattern));
      }
    } catch (err) {
      this.logger.error(`delByPattern failed`, (err as Error).message);
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
    this.logger.log(SYS_MSG.REDIS_CONNECTION_CLOSED);
  }
}
