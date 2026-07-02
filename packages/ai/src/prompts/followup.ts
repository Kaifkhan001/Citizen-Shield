// Followup prompt — builds the single user message appended to the
// chat history each turn. Keeps the AI focused on what we already know
// and the next thing to ask. Pure string assembly, no I/O.

import type { IntakeState, ExtractedFacts, Question } from '../state';
import type { CaseCategory } from '@citizen-shield/types';

export interface FollowupPromptContext {
  state: IntakeState;
  facts: ExtractedFacts;
  /** Optional override of the assistant question to anchor on. */
  focusQuestion?: Question;
  /** Optional category hint from earlier turns. */
  categoryHint?: CaseCategory;
}

export function buildFollowupPrompt(ctx: FollowupPromptContext): string {
  const { state, facts } = ctx;
  const lines: string[] = [];

  lines.push('--- Current state ---');
  lines.push(`State: ${state.kind}`);
  lines.push('');
  lines.push('--- Known facts so far ---');
  if (facts.title) lines.push(`Title: ${facts.title}`);
  if (facts.summary) lines.push(`Summary: ${facts.summary}`);
  if (facts.category) lines.push(`Category: ${facts.category}`);
  if (facts.keyFacts.length > 0) {
    lines.push('Key facts:');
    for (const kf of facts.keyFacts) lines.push(`  - ${kf}`);
  }
  if (facts.parties.length > 0) {
    lines.push('Parties:');
    for (const p of facts.parties) {
      lines.push(`  - ${p.name}${p.role ? ` (${p.role})` : ''}`);
    }
  }
  if (facts.timeline) lines.push(`Timeline: ${facts.timeline}`);
  if (facts.desiredOutcome) lines.push(`Desired outcome: ${facts.desiredOutcome}`);

  if (ctx.focusQuestion) {
    lines.push('');
    lines.push(`--- Focus question ---`);
    lines.push(ctx.focusQuestion.prompt);
  }

  lines.push('');
  lines.push('Reply with the JSON object ONLY.');
  return lines.join('\n');
}
