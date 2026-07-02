// Safe parser for AI responses.
//
// The provider layer returns the raw `assistantMessage` string. We
// need to (a) extract JSON (in case the model wrapped it in prose)
// and (b) validate against `aiTurnResponseSchema`. Failures are
// classified so the orchestrator can decide whether to retry
// (malformed_json — usually a "wrap in JSON" reminder helps) or
// give up (schema_mismatch — the model is drifting).

import type { ParserResult } from './types';
import { aiTurnResponseSchema } from './schemas';
import type { AiTurnResponse } from './state';

/**
 * Try to parse a raw assistant message into a typed `AiTurnResponse`.
 * Returns `{ ok: false, reason }` on failure with a short detail
 * string suitable for logs (never sent to the client).
 *
 * Strategy:
 *  1. Pull the first balanced JSON object from the string. The model
 *     sometimes prefixes with prose like "Sure! Here's my analysis:"
 *     and we want to be forgiving.
 *  2. JSON.parse the slice.
 *  3. Validate with `aiTurnResponseSchema`.
 */
export function safeParseAiResponse(raw: string): ParserResult<AiTurnResponse> {
  const trimmed = raw.trim();
  const slice = extractFirstJsonObject(trimmed);
  if (slice === null) {
    return {
      ok: false,
      reason: 'malformed_json',
      detail: `no JSON object found in response (${trimmed.length} chars)`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (err) {
    return {
      ok: false,
      reason: 'malformed_json',
      detail: err instanceof Error ? err.message : 'JSON.parse failed',
    };
  }
  const result = aiTurnResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: 'schema_mismatch',
      detail: result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }
  // The Zod schema's runtime shape matches the `AiTurnResponse` type
  // exactly. Cast through unknown to keep the schema independent of
  // the type definition (in case the type is later widened).
  return { ok: true, data: result.data as unknown as AiTurnResponse };
}

/**
 * Walk a string and return the substring of the first balanced
 * top-level `{ ... }` (ignoring braces inside strings or after a
 * backslash). Returns null if no balanced object is found.
 *
 * Implementation is small and explicit so it doesn't pull in a
 * parser dependency for one helper.
 */
function extractFirstJsonObject(s: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}
