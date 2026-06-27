import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from '@citizen-shield/logger';
import { env } from '@citizen-shield/config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { CasesModule } from './cases/cases.module';
import { EvidenceModule } from './evidence/evidence.module';
import { TimelineModule } from './timeline/timeline.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { pinoOptions } from '@citizen-shield/logger';

@Module({
  imports: [
    // Pino logger — JSON in prod, pretty in dev.
    LoggerModule.forRoot(pinoOptions),

    // Rate limiting. Defaults are env-driven (`RATE_LIMIT_TTL`,
    // `RATE_LIMIT_LIMIT`); auth routes use a stricter per-route `@Throttle`
    // (5 req / minute) to deter credential stuffing. Tests raise the limit so
    // a single suite can issue hundreds of auth requests.
    ThrottlerModule.forRoot([
      {
        ttl: env.NODE_ENV === 'test' ? 1_000 : env.RATE_LIMIT_TTL,
        limit: env.NODE_ENV === 'test' ? 100_000 : env.RATE_LIMIT_LIMIT,
      },
    ]),

    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CasesModule,
    EvidenceModule,
    TimelineModule,
    ComplaintsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  static readonly port = env.BACKEND_PORT;
}
