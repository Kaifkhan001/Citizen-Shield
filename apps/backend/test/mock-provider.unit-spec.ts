// Pure unit tests for MockProvider.
// No Nest, no network — exercises the scripted responses and the
// default JSON parser path.

import { MockProvider, safeParseAiResponse } from '@citizen-shield/ai';
import type { ChatRequest } from '@citizen-shield/ai';

function req(content: string): ChatRequest {
  return { messages: [{ role: 'user', content }] };
}

describe('MockProvider (unit)', () => {
  const provider = new MockProvider();

  it('name() returns "mock"', () => {
    expect(provider.name()).toBe('mock');
  });

  it('returns a parsed AiTurnResponse for a short user message', async () => {
    const out = await provider.chat(req('hello there'), {
      parse: safeParseAiResponse as unknown as Parameters<MockProvider['chat']>[1] extends infer O
        ? O extends { parse?: infer P }
          ? P
          : never
        : never,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.data.assistantMessage.length).toBeGreaterThan(0);
      expect(out.data.isReadyToConfirm).toBe(false);
    }
  });

  it('marks long messages as ready_to_confirm', async () => {
    const long =
      'I bought a defective laptop from the local electronics store two weeks ago and the manager simply refuses to process a refund even though my receipt is dated less than fourteen days ago, the unit never powered on, and the packaging was unopened when I returned it yesterday afternoon';
    const r = await provider.chat(req(long));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.isReadyToConfirm).toBe(true);
      expect(r.data.detectedCategory).toBe('CONSUMER_COMPLAINT');
      expect(r.data.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('returns confidence 0.1 + asked followup for empty messages', async () => {
    const r = await provider.chat(req(''));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.confidence).toBe(0.1);
      expect(r.data.isReadyToConfirm).toBe(false);
    }
  });

  it('always returns valid JSON that safeParseAiResponse accepts', async () => {
    const inputs = [
      'short',
      'a bit more text',
      'medium length user reply here',
      'long '.repeat(20).trim(),
    ];
    for (const i of inputs) {
      const r = await provider.chat(req(i));
      expect(r.ok).toBe(true);
    }
  });
});
