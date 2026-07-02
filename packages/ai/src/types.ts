// @citizen-shield/ai
//
// Provider-agnostic AI types. The intake conversation lives in this
// package as a discriminated-union state machine (see ./state.ts) plus
// a small `AIProvider` interface that every concrete provider
// (MockProvider, OpenAIProvider, …) implements.
//
// Design rule: no agent framework, no magic. Every AI action is a pure
// function over a typed contract. Providers return structured JSON only;
// callers validate with the Zod schemas in ./schemas.ts before folding
// the response into the reducer.

import type { CaseCategory } from '@citizen-shield/types';

// Provider transport — what every concrete provider receives + returns.
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Defaults to provider's configured temperature. */
  temperature?: number;
  /** Defaults to provider's configured model. */
  model?: string;
}

/**
 * Provider-agnostic result. `ok: true` carries `data` typed to the
 * caller's parser contract (the chat layer is generic; the intake
 * service supplies a parser via the `parse` option). Failure modes
 * are normalized so the caller doesn't need to know which provider
 * produced them.
 */
export type ChatResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: 'transport' | 'rate_limit' | 'auth' | 'unknown';
      message: string;
    };

/**
 * JSON-mode parser. Receives the raw string from the provider's
 * `assistantMessage` slot and either returns typed data or a
 * structured failure reason.
 */
export type AiParser<T> = (raw: string) => ParserResult<T>;

export type ParserResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'malformed_json' | 'schema_mismatch'; detail: string };

/**
 * Every concrete provider exposes this interface. The contract is
 * deliberately tiny: one `chat` call and one `name`. We never wrap
 * providers in agents — the controller-side orchestrator decides when
 * to call, what to do with the result, and whether to retry.
 */
export interface AIProvider {
  name(): string;
  chat<T>(req: ChatRequest, opts?: { parse?: AiParser<T> }): Promise<ChatResult<T>>;
}

// Conversation domain types — re-exported for callers' convenience.
export type { CaseCategory };

// Re-export the reducer types so consumers can `import { IntakeState }
// from '@citizen-shield/ai'` without reaching into ./state directly.
export type {
  IntakeState,
  ExtractedFacts,
  Party,
  Question,
  CaseDraft,
  AiTurnResponse,
} from './state';
