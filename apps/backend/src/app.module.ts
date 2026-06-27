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

    // Rate limiting. Defaults are loose (100 req / 60s); auth routes use
    // `@Throttle({ default: { limit: 5, ttl: 60_000 } })` to get a stricter
    // limit per IP. Tests disable throttling so a single suite can issue
    // hundreds of auth requests without tripping the limiter.
    ThrottlerModule.forRoot([
      {
        ttl: env.NODE_ENV === 'test' ? 1_000 : 60_000,
        limit: env.NODE_ENV === 'test' ? 100_000 : 100,
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
