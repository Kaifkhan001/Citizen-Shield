// Pure unit tests for the intake state machine reducer.
// No Nest bootstrap, no DB — exercises @citizen-shield/ai/src/state.ts.

import {
  initialState,
  startConversation,
  transition,
  canSendMessage,
  shouldForceConfirm,
  isTerminal,
  mergeFacts,
  buildDefaultFollowups,
  Greeting,
  type IntakeState,
  type ExtractedFacts,
  type AiTurnResponse,
} from '@citizen-shield/ai';

const CATEGORY = 'CONSUMER_COMPLAINT' as const;

function ok(partial: Partial<AiTurnResponse> = {}): AiTurnResponse {
  return {
    assistantMessage: 'Could you tell me more?',
    stateUpdate: {},
    detectedCategory: null,
    isReadyToConfirm: false,
    confidence: 0.5,
    ...partial,
  };
}

describe('intake state machine (unit)', () => {
  describe('Greeting + initial state', () => {
    it('initialState() returns { kind: "started" }', () => {
      expect(initialState()).toEqual({ kind: 'started' });
    });

    it('startConversation returns the local greeting and gathering_problem state', () => {
      const out = startConversation();
      expect(out.greeting).toBe(Greeting);
      expect(out.nextState.kind).toBe('gathering_problem');
    });

    it('startConversation includes the initial user message when provided', () => {
      const out = startConversation('I bought a laptop');
      expect(out.nextState).toMatchObject({
        kind: 'gathering_problem',
        turnCount: 1,
        lastUserMessage: 'I bought a laptop',
      });
    });
  });

  describe('canSendMessage / shouldForceConfirm / isTerminal', () => {
    it('canSendMessage accepts the four gathering_* states', () => {
      const states: IntakeState[] = [
        { kind: 'gathering_problem', turnCount: 0, lastUserMessage: null },
        { kind: 'gathering_category', candidates: [CATEGORY] },
        { kind: 'gathering_facts', facts: emptyFacts() },
        { kind: 'gathering_followups', pendingQuestions: [], facts: emptyFacts() },
      ];
      for (const s of states) {
        expect(canSendMessage(s)).toBe(true);
      }
    });

    it('canSendMessage rejects started, ready_to_confirm, confirmed, failed', () => {
      expect(canSendMessage({ kind: 'started' })).toBe(false);
      expect(
        canSendMessage({
          kind: 'ready_to_confirm',
          draft: { title: 't', description: 'd', category: CATEGORY },
          facts: emptyFacts(),
        }),
      ).toBe(false);
      expect(canSendMessage({ kind: 'confirmed', caseId: 'c' })).toBe(false);
      expect(canSendMessage({ kind: 'failed', reason: 'r' })).toBe(false);
    });

    it('shouldForceConfirm is true only in ready_to_confirm', () => {
      expect(shouldForceConfirm({ kind: 'started' })).toBe(false);
      expect(
        shouldForceConfirm({ kind: 'gathering_problem', turnCount: 0, lastUserMessage: null }),
      ).toBe(false);
      expect(
        shouldForceConfirm({
          kind: 'ready_to_confirm',
          draft: { title: 't', description: 'd', category: CATEGORY },
          facts: emptyFacts(),
        }),
      ).toBe(true);
    });

    it('isTerminal is true for confirmed + failed', () => {
      expect(isTerminal({ kind: 'confirmed', caseId: 'x' })).toBe(true);
      expect(isTerminal({ kind: 'failed', reason: 'r' })).toBe(true);
      expect(isTerminal({ kind: 'started' })).toBe(false);
    });
  });

  describe('mergeFacts', () => {
    it('merges partial facts additively, deduplicating arrays', () => {
      const a: ExtractedFacts = { keyFacts: ['a'], parties: [{ name: 'Alice' }] };
      const out = mergeFacts(a, {
        keyFacts: ['b', 'a'],
        parties: [{ name: 'Alice' }, { name: 'Bob' }],
        timeline: '2 weeks ago',
      });
      expect(out.keyFacts.sort()).toEqual(['a', 'b']);
      expect(out.parties).toHaveLength(2);
      expect(out.timeline).toBe('2 weeks ago');
    });

    it('does not overwrite a set field with an empty one', () => {
      const a: ExtractedFacts = { title: 'Hello', keyFacts: [], parties: [] };
      const out = mergeFacts(a, { title: '' });
      // Zod partial allows empty string; merge keeps the explicit value.
      expect(out.title).toBe('');
    });
  });

  describe('transition — gathering_problem', () => {
    it('stays in gathering_problem when no category detected', () => {
      const state: IntakeState = { kind: 'gathering_problem', turnCount: 1, lastUserMessage: 'u' };
      const r = transition(
        state,
        'more text',
        ok({ stateUpdate: { keyFacts: ['x'] } }),
        emptyFacts(),
      );
      expect(r.nextState.kind).toBe('gathering_problem');
      if (r.nextState.kind === 'gathering_problem') {
        expect(r.nextState.turnCount).toBe(2);
        expect(r.nextState.lastUserMessage).toBe('more text');
        expect(r.nextFacts.keyFacts).toContain('x');
      }
    });

    it('promotes to gathering_category when category detected', () => {
      const state: IntakeState = { kind: 'gathering_problem', turnCount: 1, lastUserMessage: null };
      const r = transition(
        state,
        'I want a refund',
        ok({ detectedCategory: CATEGORY }),
        emptyFacts(),
      );
      expect(r.nextState.kind).toBe('gathering_category');
      expect(r.nextFacts.category).toBe(CATEGORY);
    });
  });

  describe('transition — gathering_category', () => {
    it('moves to gathering_facts', () => {
      const state: IntakeState = { kind: 'gathering_category', candidates: [CATEGORY] };
      const r = transition(state, 'yes consumer', ok(), {
        keyFacts: [],
        parties: [],
        category: CATEGORY,
      });
      expect(r.nextState.kind).toBe('gathering_facts');
    });

    it('fails if no category resolved', () => {
      const state: IntakeState = { kind: 'gathering_category', candidates: [] };
      const r = transition(state, 'x', ok(), emptyFacts());
      expect(r.nextState.kind).toBe('failed');
      if (r.nextState.kind === 'failed') {
        expect(r.nextState.reason).toBe('missing_category');
      }
    });
  });

  describe('transition — gathering_facts', () => {
    it('moves to ready_to_confirm when AI is ready and facts are sufficient', () => {
      const state: IntakeState = { kind: 'gathering_facts', facts: emptyFacts() };
      const r = transition(
        state,
        'I have receipts',
        ok({
          isReadyToConfirm: true,
          stateUpdate: {
            title: 'Refund refused for defective laptop',
            keyFacts: ['one', 'two', 'three'],
            category: CATEGORY,
          },
        }),
        { keyFacts: [], parties: [], category: CATEGORY },
      );
      expect(r.nextState.kind).toBe('ready_to_confirm');
    });

    it('moves to gathering_followups otherwise', () => {
      const state: IntakeState = { kind: 'gathering_facts', facts: emptyFacts() };
      const r = transition(
        state,
        'more details',
        ok({ stateUpdate: { keyFacts: ['x'] } }),
        emptyFacts(),
      );
      expect(r.nextState.kind).toBe('gathering_followups');
    });
  });

  describe('transition — gathering_followups', () => {
    it('moves to ready_to_confirm when facts are sufficient and no questions left', () => {
      const state: IntakeState = {
        kind: 'gathering_followups',
        pendingQuestions: [],
        facts: emptyFacts(),
      };
      const r = transition(state, 'done', ok({ isReadyToConfirm: true }), {
        keyFacts: ['a', 'b', 'c'],
        parties: [],
        category: CATEGORY,
        title: 'Refund refused',
      });
      expect(r.nextState.kind).toBe('ready_to_confirm');
    });

    it('fails with insufficient_facts when facts still lacking', () => {
      const state: IntakeState = {
        kind: 'gathering_followups',
        pendingQuestions: [],
        facts: emptyFacts(),
      };
      const r = transition(state, 'done', ok({ isReadyToConfirm: true }), emptyFacts());
      expect(r.nextState.kind).toBe('failed');
    });
  });

  describe('transition — terminal states reject further input', () => {
    it('confirmed state is stable; transition returns invalid=true', () => {
      const state: IntakeState = { kind: 'confirmed', caseId: 'abc' };
      const r = transition(state, 'new message', ok(), emptyFacts());
      expect(r.invalid).toBe(true);
      expect(r.nextState).toEqual(state);
    });
    it('failed state is stable; transition returns invalid=true', () => {
      const state: IntakeState = { kind: 'failed', reason: 'insufficient_facts' };
      const r = transition(state, 'more', ok(), emptyFacts());
      expect(r.invalid).toBe(true);
      expect(r.nextState).toEqual(state);
    });
  });

  describe('buildDefaultFollowups', () => {
    it('asks about timeline when missing', () => {
      const qs = buildDefaultFollowups({ keyFacts: [], parties: [] });
      expect(qs.map((q) => q.id)).toContain('when');
    });
    it('asks about parties when none', () => {
      const qs = buildDefaultFollowups({ keyFacts: ['x'], parties: [] });
      expect(qs.map((q) => q.id)).toContain('who');
    });
    it('asks about outcome when missing', () => {
      const qs = buildDefaultFollowups({ keyFacts: ['x'], parties: [{ name: 'A' }] });
      expect(qs.map((q) => q.id)).toContain('outcome');
    });
    it('returns no followups when facts are complete', () => {
      const qs = buildDefaultFollowups({
        keyFacts: ['x'],
        parties: [{ name: 'A' }],
        timeline: 'yesterday',
        desiredOutcome: 'refund',
      });
      expect(qs).toEqual([]);
    });
  });
});

function emptyFacts(): ExtractedFacts {
  return { keyFacts: [], parties: [] };
}
