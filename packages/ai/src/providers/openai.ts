// OpenAIProvider — wraps the official `openai` SDK.
//
// Uses `response_format: { type: 'json_object' }` so the model is
// forced to reply with a single JSON object. We then validate the
// string with `safeParseAiResponse` so caller-supplied parsers (the
// intake service) can rely on the same parser as the mock provider.
//
// Errors are normalised into `ChatResult` failure reasons:
//   - 401 / 403   → 'auth'
//   - 429         → 'rate_limit'
//   - everything else → 'transport'
//
// We never throw out of `chat()` — callers always branch on `ok`.

import OpenAI from 'openai';
import { AIProviderBase } from '../provider';
import type { ChatMessage, ChatRequest, ChatResult, AiParser } from '../types';

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  defaultTemperature?: number;
  /** Optional override for tests; defaults to the real OpenAI client. */
  client?: OpenAI;
}

export class OpenAIProvider extends AIProviderBase {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultTemperature: number;

  constructor(opts: OpenAIProviderOptions) {
    super();
    this.client = opts.client ?? new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'gpt-4o-mini';
    this.defaultTemperature = opts.defaultTemperature ?? 0.2;
  }

  name(): string {
    return 'openai';
  }

  async chat<T>(req: ChatRequest, opts?: { parse?: AiParser<T> }): Promise<ChatResult<T>> {
    try {
      const completion = await this.client.chat.completions.create({
        model: req.model ?? this.model,
        messages: req.messages.map((m) => toOpenAiMessage(m)),
        temperature: req.temperature ?? this.defaultTemperature,
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices[0]?.message?.content ?? '';
      const parser: AiParser<T> = opts?.parse ?? (this.defaultJsonParser as unknown as AiParser<T>);
      return this.parsed<T>(raw, parser);
    } catch (err) {
      return mapOpenAiError<T>(err);
    }
  }
}

function mapOpenAiError<T>(err: unknown): ChatResult<T> {
  // The SDK attaches a `status` field on its `APIError`. We avoid
  // `instanceof` because the SDK's class shape can differ across
  // versions; structural narrowing is enough.
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: number }).status;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 401 || status === 403) {
      return { ok: false, reason: 'auth', message };
    }
    if (status === 429) {
      return { ok: false, reason: 'rate_limit', message };
    }
    return { ok: false, reason: 'transport', message };
  }
  return {
    ok: false,
    reason: 'unknown',
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Convert our provider-agnostic `ChatMessage` into the SDK's
 * strongly-typed message param. We never send tool messages through
 * this provider — the intake service only emits system/user/assistant.
 */
function toOpenAiMessage(m: ChatMessage): {
  role: 'system' | 'user' | 'assistant';
  content: string;
} {
  if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
    return { role: m.role, content: m.content };
  }
  // Tool messages aren't supported here; fold them into user turns.
  return { role: 'user', content: m.content };
}
