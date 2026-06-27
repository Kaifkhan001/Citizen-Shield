import { Module, Global, Logger, Inject, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '@citizen-shield/config';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const logger = new Logger('Redis');

const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });

    // M1: connection errors are non-fatal. Future milestones may surface them.
    client.on('error', (err: Error) => {
      logger.warn(`Redis connection error: ${err.message}`);
    });
    client.on('ready', () => {
      logger.log('Redis connection ready');
    });

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Disconnect cleanly so the ioredis socket doesn't leak across hot-reloads.
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
