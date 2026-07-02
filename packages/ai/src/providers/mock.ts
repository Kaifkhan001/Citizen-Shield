// MockProvider — deterministic scripted responses for dev + tests.
//
// Walks the conversation through the deterministic arc:
//   1st user message → category detection + first key fact
//   2nd message     → more facts + party info
//   3rd message     → timeline + desired outcome
//   4th message     → ready_to_confirm
//
// Each script is keyed by the user message's *word count* so the
// sequence is predictable. The MockProvider never makes a network
// call and never reads Date.now() — it's pure-input/pure-output for
// the same reason the reducer is.

import { AIProviderBase } from '../provider';
import type { ChatRequest, ChatResult, AiParser } from '../types';
import type { AiTurnResponse } from '../state';

export class MockProvider extends AIProviderBase {
  name(): string {
    return 'mock';
  }

  async chat<T>(req: ChatRequest, opts?: { parse?: AiParser<T> }): Promise<ChatResult<T>> {
    // The last user message is the trigger.
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const lastUser = userMessages.at(-1)?.content ?? '';
    const wordCount = lastUser.trim().split(/\s+/).filter(Boolean).length;

    const scripted = this.scriptForTurn(wordCount, lastUser);
    const raw = JSON.stringify(scripted);

    const adapter: AiParser<T> = opts?.parse ?? (this.defaultJsonParser as unknown as AiParser<T>);
    return this.parsed<T>(raw, adapter);
  }

  /**
   * Pick the scripted response for the given user-message word count.
   * Words are the heuristic so tests can drive the conversation with
   * simple "short", "medium", "long" inputs.
   */
  private scriptForTurn(wordCount: number, lastUser: string): AiTurnResponse {
    if (wordCount === 0) {
      return {
        assistantMessage: 'Tell me a bit more — what happened?',
        stateUpdate: {},
        detectedCategory: null,
        isReadyToConfirm: false,
        confidence: 0.1,
      };
    }
    if (wordCount < 6) {
      return {
        assistantMessage: 'Got it. Can you tell me when this happened and who else is involved?',
        stateUpdate: {
          keyFacts: [lastUser.trim()],
          summary: lastUser.trim(),
        },
        detectedCategory: 'CONSUMER_COMPLAINT',
        isReadyToConfirm: false,
        confidence: 0.4,
      };
    }
    if (wordCount < 12) {
      return {
        assistantMessage: 'Thanks. When did this take place, and what outcome are you hoping for?',
        stateUpdate: {
          keyFacts: [lastUser.trim()],
          parties: extractParties(lastUser),
          timeline: 'recent',
        },
        detectedCategory: 'CONSUMER_COMPLAINT',
        isReadyToConfirm: false,
        confidence: 0.65,
      };
    }
    if (wordCount < 20) {
      return {
        assistantMessage:
          "That's helpful. Last question — what outcome would feel like a win for you here?",
        stateUpdate: {
          keyFacts: [lastUser.trim()],
          parties: extractParties(lastUser),
          timeline: extractTimeline(lastUser),
          desiredOutcome: 'resolution',
          title: deriveHeadline(lastUser),
        },
        detectedCategory: 'CONSUMER_COMPLAINT',
        isReadyToConfirm: false,
        confidence: 0.8,
      };
    }
    // Long messages → ready to confirm.
    return {
      assistantMessage:
        'I think I have enough to put together your case. Take a look at the summary on the next screen.',
      stateUpdate: {
        keyFacts: [lastUser.trim()],
        parties: extractParties(lastUser),
        timeline: extractTimeline(lastUser),
        desiredOutcome: 'resolution',
        summary: lastUser.trim(),
        title: deriveHeadline(lastUser),
      },
      detectedCategory: 'CONSUMER_COMPLAINT',
      isReadyToConfirm: true,
      confidence: 0.9,
    };
  }
}

/**
 * Naive party extractor: capitalised tokens that aren't at the start
 * of the sentence. Good enough for the mock provider's tests; the
 * real provider does this through the LLM.
 */
function extractParties(text: string): Array<{ name: string; role?: string }> {
  const out: Array<{ name: string; role?: string }> = [];
  const tokens = text.split(/\s+/);
  for (let i = 1; i < tokens.length; i += 1) {
    const t = tokens[i]?.replace(/[^A-Za-z]/g, '') ?? '';
    if (t.length > 1 && /^[A-Z]/.test(t)) {
      out.push({ name: t });
      if (out.length >= 3) break;
    }
  }
  return out;
}

function extractTimeline(text: string): string {
  // Look for any "<n> days/weeks/months ago" pattern.
  const m = text.match(/(\d+)\s+(day|week|month|year)s?\s+ago/i);
  return m ? m[0] : text.slice(0, 60);
}

function deriveHeadline(text: string): string {
  const first = text.split(/[.!?]/)[0]?.trim() ?? text.trim();
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}
