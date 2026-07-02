// Confirm-prompt — asks the AI to produce the final `CaseDraft` from
// the extracted facts. Used by the controller when the reducer has
// decided we're ready to confirm; in practice the reducer derives
// the draft deterministically (see state.ts:toDraft) and we only call
// this if we want the AI to polish the title/description.

import type { ExtractedFacts, CaseDraft } from '../state';
import type { CaseCategory } from '@citizen-shield/types';

export function buildConfirmSummaryPrompt(facts: ExtractedFacts, category: CaseCategory): string {
  const lines: string[] = [];
  lines.push('Please produce a final case draft.');
  lines.push('');
  lines.push('Constraints:');
  lines.push('  - `title`: 6–12 words. Headline-style. No trailing period.');
  lines.push('  - `description`: 2–4 paragraphs. Plain prose, no bullets.');
  lines.push(`  - 'category' MUST be: "${category}"`);
  lines.push('');
  lines.push('Reply with the JSON object ONLY. The shape is:');
  lines.push('{ "title": string, "description": string, "category": "..." }');
  lines.push('');
  lines.push('--- Known facts ---');
  if (facts.title) lines.push(`Title draft: ${facts.title}`);
  if (facts.summary) lines.push(`Summary: ${facts.summary}`);
  for (const kf of facts.keyFacts) lines.push(`- ${kf}`);
  for (const p of facts.parties) {
    lines.push(`- ${p.name}${p.role ? ` (${p.role})` : ''}`);
  }
  if (facts.timeline) lines.push(`Timeline: ${facts.timeline}`);
  if (facts.desiredOutcome) lines.push(`Desired outcome: ${facts.desiredOutcome}`);
  return lines.join('\n');
}

/**
 * Local default — used when we don't want to spend an AI call on the
 * final draft. The reducer already produces this; the helper exists
 * so the controller can call the same code path whether the draft
 * came from the AI or the deterministic builder.
 */
export function buildLocalDraft(facts: ExtractedFacts, category: CaseCategory): CaseDraft {
  const title = facts.title ?? deriveTitle(facts);
  const description = facts.summary ?? deriveDescription(facts);
  return { title, description, category };
}

function deriveTitle(facts: ExtractedFacts): string {
  const first = facts.keyFacts[0];
  if (!first) return 'Untitled case';
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}

function deriveDescription(facts: ExtractedFacts): string {
  const lines: string[] = [];
  if (facts.summary) lines.push(facts.summary);
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
