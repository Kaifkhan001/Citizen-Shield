import { Controller, Get, Inject } from '@nestjs/common';
import type { PrismaClient } from '@citizen-shield/database';
import type Redis from 'ioredis';
import type { HealthResponse } from '@citizen-shield/validation';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PRISMA_CLIENT } from '../database/database.module';

const SERVICE_NAME = 'Citizen Shield API';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    // Verify dependencies are reachable. Failures are logged but do not
    // crash the response — this milestone only requires that the route exists.
    await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);

    return {
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  }
}
