// Intake state machine.
//
// The conversation progresses through these states:
//
//   started
//      ↓
//   gathering_problem  ──→ gathering_category
//                                  ↓
//                            gathering_facts
//                                  ↓
//                            gathering_followups
//                                  ↓
//                            ready_to_confirm
//                                  ↓  (POST /confirm)
//                            confirmed
//
// At any point we can transition to `failed` (bad AI output twice,
// max messages exceeded, user abort). `confirmed` and `failed` are
// terminal: further `transition()` calls return the same state with
// an `invalid: true` flag so the controller can throw INTAKE_INVALID_STATE.
//
// The reducer is pure. No database access happens here — the caller
// (IntakeService) fetches the current row, runs the reducer, and
// persists the result. This is what makes the unit tests possible
// without a Nest bootstrap.

import type { CaseCategory } from '@citizen-shield/types';
import type { ExtractedFactsInput, AiTurnResponseInput, CaseDraftInput } from './schemas';

// -----------------------------------------------------------------------------
// Domain shapes (mirrored in `Conversation.extracted` and the wire envelope).
// -----------------------------------------------------------------------------

export interface Party {
  name: string;
  role?: string;
}

export interface Question {
  id: string;
  prompt: string;
  priority: number;
}

export interface ExtractedFacts {
  title?: string;
  summary?: string;
  category?: CaseCategory;
  keyFacts: string[];
  parties: Party[];
  timeline?: string;
  desiredOutcome?: string;
}

export interface CaseDraft {
  title: string;
  description: string;
  category: CaseCategory;
}

/**
 * The response the AI provider must produce on every turn. Validated
 * by `aiTurnResponseSchema` before reaching the reducer.
 */
export interface AiTurnResponse {
  assistantMessage: string;
  stateUpdate: Partial<ExtractedFacts>;
  detectedCategory: CaseCategory | null;
  isReadyToConfirm: boolean;
  confidence: number;
}

// -----------------------------------------------------------------------------
// IntakeState — discriminated union, exhaustively narrowed by `kind`.
// -----------------------------------------------------------------------------

export type IntakeState =
  | { kind: 'started' }
  | {
      kind: 'gathering_problem';
      turnCount: number;
      lastUserMessage: string | null;
    }
  | { kind: 'gathering_category'; candidates: CaseCategory[] }
  | { kind: 'gathering_facts'; facts: ExtractedFacts }
  | { kind: 'gathering_followups'; pendingQuestions: Question[]; facts: ExtractedFacts }
  | { kind: 'ready_to_confirm'; draft: CaseDraft; facts: ExtractedFacts }
  | { kind: 'confirmed'; caseId: string }
  | { kind: 'failed'; reason: string };

/** The constant greeting the orchestrator uses as the first assistant message. */
export const Greeting =
  "Hi — I'm here to help you file a case. Tell me, in your own words, what's going on.";

/** Initial state. The controller advances this to `gathering_problem` on /start. */
export function initialState(): IntakeState {
  return { kind: 'started' };
}

// -----------------------------------------------------------------------------
// Pure helpers — no I/O.
// -----------------------------------------------------------------------------

/** True for the four states that accept a user message. */
export function canSendMessage(state: IntakeState): boolean {
  return (
    state.kind === 'gathering_problem' ||
    state.kind === 'gathering_category' ||
    state.kind === 'gathering_facts' ||
    state.kind === 'gathering_followups'
  );
}

/** True only when the user can hit "Confirm and create case". */
export function shouldForceConfirm(state: IntakeState): boolean {
  return state.kind === 'ready_to_confirm';
}

/** True once the conversation is in a terminal state. */
export function isTerminal(state: IntakeState): boolean {
  return state.kind === 'confirmed' || state.kind === 'failed';
}

// -----------------------------------------------------------------------------
// Reducer.
// -----------------------------------------------------------------------------

export interface TransitionResult {
  nextState: IntakeState;
  /** Facts after the AI's `stateUpdate` is merged. */
  nextFacts: ExtractedFacts;
  /**
   * Optional: true if the caller should reject the request outright
   * because the conversation is in a terminal state and no transition
   * is possible. The controller maps this to INTAKE_INVALID_STATE.
   */
  invalid?: boolean;
}

const EMPTY_FACTS: ExtractedFacts = { keyFacts: [], parties: [] };

/**
 * Merge `partial` into `facts` without overwriting already-set fields
 * unless `partial` supplies a non-empty value. Arrays are de-duplicated
 * by content so the AI can repeat itself safely.
 */
export function mergeFacts(
  facts: ExtractedFacts,
  partial: Partial<ExtractedFacts>,
): ExtractedFacts {
  const merged: ExtractedFacts = {
    ...facts,
    ...partial,
  };
  if (partial.keyFacts !== undefined) {
    merged.keyFacts = dedupeStrings([...facts.keyFacts, ...partial.keyFacts]);
  }
  if (partial.parties !== undefined) {
    merged.parties = dedupeParties([...facts.parties, ...partial.parties]);
  }
  return merged;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function dedupeParties(arr: Party[]): Party[] {
  const seen = new Set<string>();
  const out: Party[] = [];
  for (const p of arr) {
    const key = `${p.name.toLowerCase()}|${(p.role ?? '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * The pure reducer. Returns the next state given the current state,
 * the user's latest message (already captured in `messages` by the
 * service layer), and the AI's structured response.
 *
 * Guarantees:
 *  - Pure: no I/O, no Date.now, no randomness.
 *  - Total: every (state, response) pair yields a `nextState`.
 *  - Conservative: an illegal transition (e.g. confirm called from a
 *    gathering state) returns the current state with `invalid: true`.
 */
export function transition(
  state: IntakeState,
  _userMessage: string,
  response: AiTurnResponse,
  currentFacts: ExtractedFacts = EMPTY_FACTS,
): TransitionResult {
  // Terminal states reject any further transition.
  if (isTerminal(state)) {
    return { nextState: state, nextFacts: currentFacts, invalid: true };
  }

  const mergedFacts = mergeFacts(currentFacts, response.stateUpdate);

  switch (state.kind) {
    case 'started': {
      // /start is handled out of band (greeting is local). The reducer
      // is only invoked from /message, so `started` here is a defensive
      // fallback that promotes directly to gathering_problem.
      return {
        nextState: {
          kind: 'gathering_problem',
          turnCount: 1,
          lastUserMessage: _userMessage,
        },
        nextFacts: mergedFacts,
      };
    }

    case 'gathering_problem': {
      const nextTurnCount = state.turnCount + 1;
      // If the AI has detected a category, promote to the category state.
      if (response.detectedCategory !== null) {
        return {
          nextState: {
            kind: 'gathering_category',
            candidates: [response.detectedCategory],
          },
          nextFacts: { ...mergedFacts, category: response.detectedCategory },
        };
      }
      // Otherwise keep gathering — but if facts are accumulating, move on.
      if (response.isReadyToConfirm && hasEnoughFactsForDraft(mergedFacts)) {
        return {
          nextState: {
            kind: 'ready_to_confirm',
            draft: toDraft(mergedFacts, response.detectedCategory),
            facts: mergedFacts,
          },
          nextFacts: mergedFacts,
        };
      }
      return {
        nextState: {
          kind: 'gathering_problem',
          turnCount: nextTurnCount,
          lastUserMessage: _userMessage,
        },
        nextFacts: mergedFacts,
      };
    }

    case 'gathering_category': {
      // Category was set on entry. Move into fact gathering.
      const fallbackCategory = state.candidates[0];
      if (!fallbackCategory && !mergedFacts.category) {
        // No category resolved — this is a malformed transition; bail to failure.
        return {
          nextState: { kind: 'failed', reason: 'missing_category' },
          nextFacts: mergedFacts,
        };
      }
      const chosenCategory = (mergedFacts.category ?? fallbackCategory) as CaseCategory;
      return {
        nextState: {
          kind: 'gathering_facts',
          facts: { ...mergedFacts, category: chosenCategory },
        },
        nextFacts: { ...mergedFacts, category: chosenCategory },
      };
    }

    case 'gathering_facts': {
      if (response.isReadyToConfirm && hasEnoughFactsForDraft(mergedFacts)) {
        return {
          nextState: {
            kind: 'ready_to_confirm',
            draft: toDraft(mergedFacts, mergedFacts.category ?? null),
            facts: mergedFacts,
          },
          nextFacts: mergedFacts,
        };
      }
      // Otherwise move into followups so we can probe for missing info.
      return {
        nextState: {
          kind: 'gathering_followups',
          pendingQuestions: buildDefaultFollowups(mergedFacts),
          facts: mergedFacts,
        },
        nextFacts: mergedFacts,
      };
    }

    case 'gathering_followups': {
      const remaining = state.pendingQuestions; // could decrement based on response
      if (remaining.length === 0 || response.isReadyToConfirm) {
        if (!hasEnoughFactsForDraft(mergedFacts)) {
          // Still not enough — fail rather than confirm a bad draft.
          return {
            nextState: {
              kind: 'failed',
              reason: 'insufficient_facts',
            },
            nextFacts: mergedFacts,
          };
        }
        return {
          nextState: {
            kind: 'ready_to_confirm',
            draft: toDraft(mergedFacts, mergedFacts.category ?? null),
            facts: mergedFacts,
          },
          nextFacts: mergedFacts,
        };
      }
      return {
        nextState: {
          kind: 'gathering_followups',
          pendingQuestions: remaining,
          facts: mergedFacts,
        },
        nextFacts: mergedFacts,
      };
    }

    case 'ready_to_confirm': {
      // User might be editing a fact in-place. Merge and stay.
      return {
        nextState: {
          kind: 'ready_to_confirm',
          draft: toDraft(mergedFacts, state.draft.category),
          facts: mergedFacts,
        },
        nextFacts: mergedFacts,
      };
    }

    case 'confirmed':
    case 'failed':
      // Covered by isTerminal above; this branch is unreachable but
      // TypeScript needs it for the discriminated union.
      return { nextState: state, nextFacts: currentFacts, invalid: true };
  }
}

// -----------------------------------------------------------------------------
// Helpers used by the reducer branches.
// -----------------------------------------------------------------------------

function hasEnoughFactsForDraft(facts: ExtractedFacts): boolean {
  return (
    facts.keyFacts.length >= 3 &&
    facts.category !== undefined &&
    facts.title !== undefined &&
    facts.title.length > 0
  );
}

function toDraft(facts: ExtractedFacts, fallbackCategory: CaseCategory | null): CaseDraft {
  const category = facts.category ?? fallbackCategory;
  if (!category) {
    throw new Error('Cannot build draft without a category');
  }
  return {
    title: facts.title ?? deriveTitle(facts),
    description: facts.summary ?? deriveDescription(facts),
    category,
  };
}

function deriveTitle(facts: ExtractedFacts): string {
  const first = facts.keyFacts[0];
  if (!first) return 'Untitled case';
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}

function deriveDescription(facts: ExtractedFacts): string {
  const lines: string[] = [];
  if (facts.summary) {
    lines.push(facts.summary);
  }
  if (facts.keyFacts.length > 0) {
    lines.push('');
    lines.push('Key facts:');
    for (const kf of facts.keyFacts) lines.push(`- ${kf}`);
  }
  if (facts.parties.length > 0) {
    lines.push('');
    lines.push('Parties:');
    for (const p of facts.parties) {
      lines.push(`- ${p.name}${p.role ? ` (${p.role})` : ''}`);
    }
  }
  if (facts.timeline) {
    lines.push('');
    lines.push(`Timeline: ${facts.timeline}`);
  }
  if (facts.desiredOutcome) {
    lines.push('');
    lines.push(`Desired outcome: ${facts.desiredOutcome}`);
  }
  return lines.join('\n');
}

/** Default followups asked in `gathering_followups`. Deterministic order. */
export function buildDefaultFollowups(facts: ExtractedFacts): Question[] {
  const qs: Question[] = [];
  if (!facts.timeline) {
    qs.push({
      id: 'when',
      prompt: 'When did this happen (exact date if you have it)?',
      priority: 1,
    });
  }
  if (facts.parties.length === 0) {
    qs.push({
      id: 'who',
      prompt: 'Who else is involved (names and roles)?',
      priority: 2,
    });
  }
  if (!facts.desiredOutcome) {
    qs.push({
      id: 'outcome',
      prompt: 'What outcome are you hoping for?',
      priority: 3,
    });
  }
  return qs.sort((a, b) => a.priority - b.priority);
}

/**
 * Promote from `started` to the active `gathering_problem` state, with
 * the greeting already recorded as the first assistant message.
 */
export function startConversation(initialMessage?: string): {
  nextState: IntakeState;
  greeting: string;
} {
  return {
    nextState: {
      kind: 'gathering_problem',
      turnCount: initialMessage ? 1 : 0,
      lastUserMessage: initialMessage ?? null,
    },
    greeting: Greeting,
  };
}

// Re-export the input types for the convenience barrel.
export type { ExtractedFactsInput, AiTurnResponseInput, CaseDraftInput };
