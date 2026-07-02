// Abstract base class for AI providers.
//
// Concrete providers (MockProvider, OpenAIProvider) extend this.
// It doesn't enforce anything the interface doesn't already do;
// it exists so future shared helpers (e.g. JSON-mode prompt wrapping,
// request-id tagging) have one place to live without each provider
// reimplementing the same boilerplate.

import type { AIProvider, ChatRequest, ChatResult, AiParser, ParserResult } from './types';
import { safeParseAiResponse } from './parse';

export abstract class AIProviderBase implements AIProvider {
  abstract name(): string;
  abstract chat<T>(req: ChatRequest, opts?: { parse?: AiParser<T> }): Promise<ChatResult<T>>;

  /**
   * Helper used by providers that need to validate the model's raw
   * string output against a caller-supplied parser. Returns a
   * well-formed ChatResult so the provider's success/failure shape
   * stays consistent.
   */
  protected parsed<T>(raw: string, parse: AiParser<T> | undefined): ChatResult<T> {
    if (!parse) {
      // No parser → the caller wants the raw string. They supply a
      // T-shaped identity parser; we just call it through.
      // The unknown cast keeps the generic contract honest.
      return {
        ok: true,
        data: raw as unknown as T,
      };
    }
    const result = parse(raw);
    if (result.ok) {
      return { ok: true, data: result.data };
    }
    return {
      ok: false,
      reason: 'transport',
      message: `parser rejected: ${result.reason} (${result.detail})`,
    };
  }

  /**
   * Default JSON parser — used by every concrete provider when the
   * caller doesn't supply their own. Keeps the `ParserResult<T>`
   * shape (with a `detail` string on failure) so the parser type
   * stays correct end-to-end.
   */
  protected defaultJsonParser<T>(raw: string): ParserResult<T> {
    const r = safeParseAiResponse(raw);
    if (r.ok) {
      return { ok: true, data: r.data as unknown as T };
    }
    return { ok: false, reason: r.reason, detail: r.detail };
  }
}
