// Pure unit tests for the AI response parser.
// No Nest, no network — exercises safeParseAiResponse from @citizen-shield/ai.

import { safeParseAiResponse, aiTurnResponseSchema } from '@citizen-shield/ai';

describe('safeParseAiResponse (unit)', () => {
  it('parses a clean JSON object', () => {
    const raw = JSON.stringify({
      assistantMessage: 'Thanks.',
      stateUpdate: { keyFacts: ['a'] },
      detectedCategory: 'CONSUMER_COMPLAINT',
      isReadyToConfirm: false,
      confidence: 0.5,
    });
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.assistantMessage).toBe('Thanks.');
      expect(r.data.detectedCategory).toBe('CONSUMER_COMPLAINT');
    }
  });

  it('extracts JSON wrapped in prose', () => {
    const raw =
      'Sure! Here is the response:\n{"assistantMessage":"hi","stateUpdate":{},"detectedCategory":null,"isReadyToConfirm":false,"confidence":0.0}\nCheers!';
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(true);
  });

  it('rejects empty string with malformed_json', () => {
    const r = safeParseAiResponse('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_json');
  });

  it('rejects prose without any JSON', () => {
    const r = safeParseAiResponse('I cannot help with this request.');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_json');
  });

  it('rejects JSON missing the assistantMessage field (schema_mismatch)', () => {
    const raw = JSON.stringify({
      stateUpdate: {},
      detectedCategory: null,
      isReadyToConfirm: false,
      confidence: 0.5,
    });
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('schema_mismatch');
  });

  it('rejects JSON with confidence > 1 (schema_mismatch)', () => {
    const raw = JSON.stringify({
      assistantMessage: 'x',
      stateUpdate: {},
      detectedCategory: null,
      isReadyToConfirm: false,
      confidence: 1.5,
    });
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('schema_mismatch');
  });

  it('rejects JSON with wrong role enum (schema_mismatch)', () => {
    const raw = JSON.stringify({
      assistantMessage: 'x',
      stateUpdate: {},
      detectedCategory: 'BOGUS',
      isReadyToConfirm: false,
      confidence: 0.5,
    });
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('schema_mismatch');
  });

  it('rejects trailing-comma malformed JSON', () => {
    const raw = '{"assistantMessage":"hi","confidence":0.0,}'; // trailing comma
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_json');
  });

  it('extracts the FIRST balanced JSON object from a stream with multiple', () => {
    const raw =
      '{"assistantMessage":"first","stateUpdate":{},"detectedCategory":null,"isReadyToConfirm":false,"confidence":0.0} {"assistantMessage":"second"}';
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.assistantMessage).toBe('first');
  });

  it('ignores braces inside JSON strings', () => {
    const raw = JSON.stringify({
      assistantMessage: 'hello {brace}',
      stateUpdate: {},
      detectedCategory: null,
      isReadyToConfirm: false,
      confidence: 0.2,
    });
    const r = safeParseAiResponse(raw);
    expect(r.ok).toBe(true);
  });

  it('the underlying zod schema rejects negative confidence', () => {
    const result = aiTurnResponseSchema.safeParse({
      assistantMessage: 'x',
      stateUpdate: {},
      detectedCategory: null,
      isReadyToConfirm: false,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });
});
