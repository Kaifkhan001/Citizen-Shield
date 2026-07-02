// IntakeModule — Nest wiring for the AI intake conversation feature.
//
// Depends on:
//   - AiModule (for the AI_PROVIDER DI token)

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

@Module({
  imports: [AiModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
