// IntakeController — REST surface for the M4 AI intake conversation.
//
// Routes (all under `/api/intake`, all `JwtAuthGuard`-protected):
//
//   POST /start                  → begin a conversation
//   POST /:id/message            → send a user turn, get an assistant turn
//   GET  /:id                    → rehydrate the conversation envelope
//   POST /:id/confirm            → finalize and create the underlying Case
//   POST /:id/abort              → mark the conversation as failed
//
// Per-route `@Throttle` reuses the AI-specific env vars so an actor
// can't hammer the AI provider past its quota even if the global
// throttler is generous.

import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { env } from '@citizen-shield/config';
import {
  intakeAbortRequestSchema,
  intakeMessageRequestSchema,
  intakeStartRequestSchema,
  uuidSchema,
  type ConversationResponse,
  type IntakeConfirmResponse,
  type IntakeMessageResponse,
  type IntakeAbortRequest,
  type IntakeMessageRequest,
  type IntakeStartRequest,
} from '@citizen-shield/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodParamPipe, ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IntakeService } from './intake.service';

const AI_THROTTLE = {
  default: { limit: env.AI_RATE_LIMIT_LIMIT, ttl: env.AI_RATE_LIMIT_TTL },
} as const;

@ApiTags('Intake')
@Controller('intake')
@UseGuards(JwtAuthGuard)
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post('start')
  @Throttle(AI_THROTTLE)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(intakeStartRequestSchema))
    body: IntakeStartRequest,
  ): Promise<IntakeMessageResponse> {
    return this.intake.start(user, body);
  }

  @Post(':id/message')
  @Throttle(AI_THROTTLE)
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(intakeMessageRequestSchema))
    body: IntakeMessageRequest,
  ): Promise<IntakeMessageResponse> {
    return this.intake.sendMessage(user, id, body.message);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
  ): Promise<ConversationResponse> {
    return this.intake.getConversation(user, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Throttle(AI_THROTTLE)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
  ): Promise<IntakeConfirmResponse> {
    return this.intake.confirm(user, id);
  }

  @Post(':id/abort')
  @HttpCode(200)
  @Throttle(AI_THROTTLE)
  async abort(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(intakeAbortRequestSchema))
    body: IntakeAbortRequest,
  ): Promise<ConversationResponse> {
    // Reason is accepted but not persisted (the service only flips
    // state to FAILED). Kept on the wire for future telemetry.
    void body.reason;
    return this.intake.abort(user, id);
  }
}
