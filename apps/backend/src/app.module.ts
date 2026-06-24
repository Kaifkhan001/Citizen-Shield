import { Module } from '@nestjs/common';
import { env } from '@citizen-shield/config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { CasesModule } from './cases/cases.module';
import { EvidenceModule } from './evidence/evidence.module';
import { TimelineModule } from './timeline/timeline.module';
import { ComplaintsModule } from './complaints/complaints.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    HealthModule,
    // Domain modules — empty for M2, populated in M3+.
    CasesModule,
    EvidenceModule,
    TimelineModule,
    ComplaintsModule,
  ],
})
export class AppModule {
  static readonly port = env.BACKEND_PORT;
}