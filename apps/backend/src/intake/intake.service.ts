// IntakeService — orchestrates the AI intake conversation.
//
// Responsibilities:
//   1. Persist the Conversation row (create, load, update).
//   2. Append user/assistant messages with timestamps.
//   3. Call the AIProvider and parse its output (with one retry).
//   4. Fold the result into the reducer.
//   5. Translate state-machine failures into ApiError codes.
//
// The reducer itself is pure; this layer adds persistence + auth +
// rate limiting on top. No business logic lives here that isn't
// already in the reducer — anything else should go into
// @citizen-shield/ai/src/state.ts.

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@citizen-shield/database';
import {
  CaseStatus,
  IntakeState as PrismaIntakeState,
  type Case,
  type CaseCategory,
  type Conversation,
} from '@citizen-shield/types';
import { env } from '@citizen-shield/config';
import { throwApiError } from '../common/api-error';
import {
  AIProvider,
  canSendMessage,
  caseDraftSchema,
  extractedFactsSchema,
  intakeMessagesSchema,
  safeParseAiResponse,
  startConversation,
  transition,
  type AiTurnResponse,
  type ExtractedFacts,
  type IntakeState,
} from '@citizen-shield/ai';
import type {
  CaseResponse,
  ConversationResponse,
  IntakeConfirmResponse,
  IntakeMessageResponse,
  IntakeStartRequest,
} from '@citizen-shield/validation';
import { PRISMA_CLIENT } from '../database/database.module';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AI_PROVIDER } from '../ai/ai.module';

// Prisma's `findUnique` returns the row OR null; after we've asserted
// non-null we collapse to the row type so callers don't need `!`.
type ConversationRow = Conversation & { messages: unknown; extracted: unknown };
type CaseRow = Case & { createdAt: Date; updatedAt: Date };

// Prisma's `Json` column accepts `Prisma.InputJsonValue`; our domain
// types don't have an index signature, so we round-trip through
// `unknown` at every Prisma write boundary. This helper keeps the
// conversion in one place.
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class IntakeService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(AI_PROVIDER) private readonly ai: AIProvider,
  ) {}

  async start(user: AuthenticatedUser, input: IntakeStartRequest): Promise<IntakeMessageResponse> {
    const { greeting } = startConversation(input.initialMessage);
    const initialMessages: Array<{ role: 'user' | 'assistant'; content: string; ts: string }> = [
      { role: 'assistant', content: greeting, ts: new Date().toISOString() },
    ];
    if (input.initialMessage) {
      initialMessages.push({
        role: 'user',
        content: input.initialMessage,
        ts: new Date().toISOString(),
      });
    }
    const created = await this.prisma.conversation.create({
      data: {
        userId: user.id,
        state: 'GATHERING_PROBLEM',
        messages: toJson(initialMessages),
        extracted: toJson(defaultExtracted()),
      },
    });
    return {
      conversation: await this.toConversationResponse(created.id),
      assistantMessage: greeting,
    };
  }

  async sendMessage(
    user: AuthenticatedUser,
    id: string,
    message: string,
  ): Promise<IntakeMessageResponse> {
    const convo = await this.loadOwnedConversation(user, id);
    const state = decodeState(convo.state, convo.extracted, convo.caseId);
    if (!canSendMessage(state)) {
      throwApiError('INTAKE_INVALID_STATE', 'Conversation is no longer accepting messages');
    }

    const messages = intakeMessagesSchema.parse(convo.messages);
    const userMessageCount = messages.filter((m) => m.role === 'user').length;
    if (userMessageCount + 1 > env.INTAKE_MAX_MESSAGES) {
      throwApiError(
        'INTAKE_MAX_MESSAGES_EXCEEDED',
        `Conversation has reached the limit of ${env.INTAKE_MAX_MESSAGES} messages`,
      );
    }

    const currentFacts = extractedFactsSchema.parse(convo.extracted) as ExtractedFacts;

    const systemPrompt = buildSystemPromptForState();
    const history = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const chatReq = {
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...history,
        { role: 'user' as const, content: message },
      ],
      temperature: env.AI_TEMPERATURE,
    };

    const aiResponse = await this.callAiWithRetry(chatReq);
    if (aiResponse === null) {
      await this.prisma.conversation.update({
        where: { id },
        data: {
          state: 'FAILED',
          messages: toJson(
            appendMessages(messages, [
              { role: 'user', content: message, ts: new Date().toISOString() },
              {
                role: 'assistant',
                content:
                  "I'm sorry — I couldn't generate a response right now. Please try again in a moment.",
                ts: new Date().toISOString(),
              },
            ]),
          ),
        },
      });
      throwApiError(
        'AI_PROVIDER_INVALID_OUTPUT',
        'AI provider returned an invalid response after one retry',
      );
    }

    const next = transition(state, message, aiResponse as AiTurnResponse, currentFacts);
    const newMessages = appendMessages(messages, [
      { role: 'user', content: message, ts: new Date().toISOString() },
      { role: 'assistant', content: aiResponse.assistantMessage, ts: new Date().toISOString() },
    ]);

    await this.prisma.conversation.update({
      where: { id },
      data: {
        state: encodeState(next.nextState),
        messages: toJson(newMessages),
        extracted: toJson(next.nextFacts),
        category: next.nextFacts.category ?? convo.category,
      },
    });

    return {
      conversation: await this.toConversationResponse(id),
      assistantMessage: aiResponse.assistantMessage,
    };
  }

  async getConversation(user: AuthenticatedUser, id: string): Promise<ConversationResponse> {
    await this.loadOwnedConversation(user, id);
    return this.toConversationResponse(id);
  }

  async confirm(user: AuthenticatedUser, id: string): Promise<IntakeConfirmResponse> {
    const convo = await this.loadOwnedConversation(user, id);

    if (convo.state === 'CONFIRMED' && convo.caseId) {
      const existing = await this.prisma.case.findUnique({ where: { id: convo.caseId } });
      if (existing) {
        return {
          caseId: existing.id,
          case: toCaseResponse(existing as CaseRow),
        };
      }
    }

    if (convo.state !== 'READY_TO_CONFIRM') {
      throwApiError('INTAKE_INVALID_STATE', 'Conversation is not ready to confirm yet');
    }

    const state = decodeState(convo.state, convo.extracted, convo.caseId);
    if (state.kind !== 'ready_to_confirm') {
      throwApiError('INTAKE_INVALID_STATE', 'Conversation extraction is incomplete');
    }
    const draft = caseDraftSchema.parse(state.draft);
    const facts = extractedFactsSchema.parse(convo.extracted) as ExtractedFacts;

    const result = await this.prisma.$transaction(async (tx) => {
      const createdCase = await tx.case.create({
        data: {
          userId: user.id,
          title: draft.title,
          description: draft.description,
          category: draft.category,
          status: CaseStatus.DRAFT,
        },
      });
      await tx.caseTimeline.create({
        data: {
          caseId: createdCase.id,
          eventType: 'CASE_CREATED',
          description: `Auto-created from AI intake conversation ${id}`,
        },
      });
      await tx.conversation.update({
        where: { id },
        data: {
          state: 'CONFIRMED',
          caseId: createdCase.id,
          category: draft.category,
          extracted: toJson({
            ...facts,
            title: draft.title,
            summary: draft.description,
            category: draft.category,
          }),
        },
      });
      return createdCase;
    });

    return {
      caseId: result.id,
      case: toCaseResponse(result as CaseRow),
    };
  }

  async abort(user: AuthenticatedUser, id: string): Promise<ConversationResponse> {
    const convo = await this.loadOwnedConversation(user, id);
    if (convo.state === 'CONFIRMED') {
      throwApiError('INTAKE_INVALID_STATE', 'Conversation is already confirmed');
    }
    await this.prisma.conversation.update({
      where: { id },
      data: { state: 'FAILED' },
    });
    return this.toConversationResponse(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers.
  // ---------------------------------------------------------------------------

  private async loadOwnedConversation(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ConversationRow> {
    const convo = await this.prisma.conversation.findUnique({ where: { id } });
    if (!convo) {
      throwApiError('INTAKE_NOT_FOUND', 'Conversation not found');
    }
    if (convo.userId !== user.id) {
      // Same not-found response so we don't leak existence.
      throwApiError('INTAKE_NOT_FOUND', 'Conversation not found');
    }
    return convo as ConversationRow;
  }

  private async toConversationResponse(id: string): Promise<ConversationResponse> {
    const row = await this.prisma.conversation.findUnique({ where: { id } });
    if (!row) {
      throwApiError('INTAKE_NOT_FOUND', 'Conversation not found');
    }
    const convo = row as ConversationRow;
    const messages = intakeMessagesSchema.parse(convo.messages);
    const facts = extractedFactsSchema.parse(convo.extracted) as ExtractedFacts;
    const state = decodeState(convo.state, convo.extracted, convo.caseId);
    return {
      id: convo.id,
      state: encodeStateForWire(state, convo.caseId),
      messages,
      extracted: facts,
      category: (convo.category ?? facts.category ?? null) as CaseCategory | null,
      caseId: convo.caseId,
      createdAt: convo.createdAt.toISOString(),
      updatedAt: convo.updatedAt.toISOString(),
    };
  }

  /**
   * Single-retry wrapper around the AI provider. Returns the parsed
   * response on success, or `null` if even the retry produced
   * invalid output. Authentication / rate-limit failures are
   * surfaced as ApiErrors directly (the caller never sees `null`
   * for those — it sees an HTTP error).
   */
  private async callAiWithRetry(chatReq: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature: number;
  }): Promise<AiTurnResponse | null> {
    const first = await this.ai.chat(chatReq, {
      parse: (raw) => safeParseAiResponse(raw),
    });
    if (first.ok) {
      return first.data;
    }
    if (first.reason === 'auth' || first.reason === 'rate_limit') {
      throwApiError('AI_RATE_LIMITED', first.message);
    }
    // Only retry on parse-shaped failures (parser rejected the
    // payload). Network / 5xx-style transport failures bubble up
    // as a 502 so callers see the upstream error immediately.
    if (first.reason !== 'transport' || !first.message.includes('parser rejected')) {
      throwApiError('AI_PROVIDER_UNAVAILABLE', first.message);
    }

    const retryReq = {
      ...chatReq,
      messages: [
        ...chatReq.messages,
        {
          role: 'system' as const,
          content:
            'IMPORTANT: Your previous reply was not valid JSON. Reply with the JSON object ALONE — no prose, no fences.',
        },
      ],
    };
    const second = await this.ai.chat(retryReq, {
      parse: (raw) => safeParseAiResponse(raw),
    });
    if (second.ok) {
      return second.data;
    }
    if (second.reason === 'auth' || second.reason === 'rate_limit') {
      throwApiError('AI_RATE_LIMITED', second.message);
    }
    return null;
  }
}

// -----------------------------------------------------------------------------
// Encoding helpers — translate between the DB enum / JSON columns and
// the in-memory discriminated union.
// -----------------------------------------------------------------------------

const STATE_KIND_TO_PRISMA: Record<IntakeState['kind'], PrismaIntakeState> = {
  started: 'STARTED',
  gathering_problem: 'GATHERING_PROBLEM',
  gathering_category: 'GATHERING_CATEGORY',
  gathering_facts: 'GATHERING_FACTS',
  gathering_followups: 'GATHERING_FOLLOWUPS',
  ready_to_confirm: 'READY_TO_CONFIRM',
  confirmed: 'CONFIRMED',
  failed: 'FAILED',
};

function encodeState(s: IntakeState): PrismaIntakeState {
  return STATE_KIND_TO_PRISMA[s.kind];
}

function decodeState(s: PrismaIntakeState, extracted: unknown, caseId: string | null): IntakeState {
  const facts = extractedFactsSchema.parse(extracted) as ExtractedFacts;
  switch (s) {
    case 'STARTED':
      return { kind: 'started' };
    case 'GATHERING_PROBLEM':
      return { kind: 'gathering_problem', turnCount: 0, lastUserMessage: null };
    case 'GATHERING_CATEGORY': {
      const candidates: CaseCategory[] = facts.category ? [facts.category] : [];
      return { kind: 'gathering_category', candidates };
    }
    case 'GATHERING_FACTS':
      return { kind: 'gathering_facts', facts };
    case 'GATHERING_FOLLOWUPS':
      return { kind: 'gathering_followups', pendingQuestions: [], facts };
    case 'READY_TO_CONFIRM': {
      const cat = facts.category;
      if (!cat) {
        return { kind: 'failed', reason: 'missing_category' };
      }
      return {
        kind: 'ready_to_confirm',
        draft: {
          title: facts.title ?? 'Untitled case',
          description: facts.summary ?? '',
          category: cat,
        },
        facts,
      };
    }
    case 'CONFIRMED':
      // caseId lives on the row, not in the enum; we patch it on
      // here so the in-memory state is self-contained.
      return { kind: 'confirmed', caseId: caseId ?? '' };
    case 'FAILED':
      return { kind: 'failed', reason: 'persisted_failure' };
  }
}

function encodeStateForWire(
  s: IntakeState,
  caseId: string | null,
): import('@citizen-shield/validation').ConversationStateDto {
  switch (s.kind) {
    case 'started':
      return { kind: 'started' };
    case 'gathering_problem':
      return {
        kind: 'gathering_problem',
        turnCount: s.turnCount,
        lastUserMessage: s.lastUserMessage,
      };
    case 'gathering_category':
      return { kind: 'gathering_category', candidates: s.candidates };
    case 'gathering_facts':
      return { kind: 'gathering_facts', facts: s.facts };
    case 'gathering_followups':
      return {
        kind: 'gathering_followups',
        pendingQuestions: s.pendingQuestions,
        facts: s.facts,
      };
    case 'ready_to_confirm':
      return { kind: 'ready_to_confirm', draft: s.draft, facts: s.facts };
    case 'confirmed':
      // Prefer the row's caseId so we never echo an empty string
      // from the in-memory decoder fallback.
      return { kind: 'confirmed', caseId: caseId ?? s.caseId };
    case 'failed':
      return { kind: 'failed', reason: s.reason };
  }
}

function appendMessages(
  existing: ReadonlyArray<{ role: 'user' | 'assistant'; content: string; ts: string }>,
  additions: ReadonlyArray<{ role: 'user' | 'assistant'; content: string; ts: string }>,
): Array<{ role: 'user' | 'assistant'; content: string; ts: string }> {
  return [...existing, ...additions];
}

function defaultExtracted(): ExtractedFacts {
  return { keyFacts: [], parties: [] };
}

function buildSystemPromptForState(): string {
  return [
    'You are CitizenShield Intake, a careful and empathetic legal intake assistant.',
    'You interview citizens who want to file a complaint. Ask ONE follow-up question per turn.',
    'Reply with a single JSON object matching the contract; do not include prose or fences.',
  ].join(' ');
}

function toCaseResponse(c: CaseRow): CaseResponse {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    status: c.status,
    userId: c.userId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
