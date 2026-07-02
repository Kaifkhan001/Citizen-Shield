// @citizen-shield/ai — public surface.
//
// Provider-agnostic AI orchestration for the M4 intake conversation.
// Architecture:
//
//   IntakeService (Nest, in apps/backend)
//        │
//        ▼
//   AIProvider  ◄── interface
//        │
//   ┌────┴────┐
//   Mock      OpenAI
//   (no net)  (openai SDK)
//
//   Every AI turn is a `chat(req)` call. The provider returns the raw
//   assistant message; the orchestrator parses it with `safeParseAiResponse`
//   and folds the result into the reducer in `./state.ts`.

// Types.
export type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  AiParser,
  ParserResult,
  AIProvider,
} from './types';

// Reducer + state machine.
export {
  type IntakeState,
  type ExtractedFacts,
  type Party,
  type Question,
  type CaseDraft,
  type AiTurnResponse,
  type TransitionResult,
  initialState,
  startConversation,
  transition,
  mergeFacts,
  canSendMessage,
  shouldForceConfirm,
  isTerminal,
  buildDefaultFollowups,
  Greeting,
} from './state';

// Zod schemas (also re-exported from @citizen-shield/validation).
export {
  caseCategorySchema,
  partySchema,
  questionSchema,
  extractedFactsSchema,
  caseDraftSchema,
  intakeMessageRowSchema,
  intakeMessagesSchema,
  aiTurnResponseSchema,
  type ExtractedFactsInput,
  type PartyInput,
  type QuestionInput,
  type CaseDraftInput,
  type AiTurnResponseInput,
  type IntakeMessageRow,
} from './schemas';

// Parser.
export { safeParseAiResponse } from './parse';

// Provider base class (concrete providers import it from `./providers/*`).
export { AIProviderBase } from './provider';

// Concrete providers — barrel'd here so callers don't have to know
// the file layout. Adding a new provider is one file + one export line.
export { MockProvider } from './providers/mock';
export { OpenAIProvider } from './providers/openai';

// Prompt builders — composable, never inlined in controllers.
export { buildSystemPrompt, type PromptSection } from './prompts/system';
export { buildFollowupPrompt } from './prompts/followup';
export { buildConfirmSummaryPrompt } from './prompts/confirm';
