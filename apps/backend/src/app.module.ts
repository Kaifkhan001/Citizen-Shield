import { Module } from '@nestjs/common';
import { env } from '@citizen-shield/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule],
})
export class AppModule {
  static readonly port = env.BACKEND_PORT;
}
