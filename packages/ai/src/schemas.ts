// Zod schemas for the AI intake contract.
//
// The AI provider is told to return JSON matching `aiTurnResponseSchema`.
// Every layer that touches a `Conversation.messages` or `Conversation.extracted`
// column narrows the JSON through one of the schemas in this file before
// trusting it.
//
// These schemas are re-exported from `@citizen-shield/validation` so the
// frontend and the backend share a single source of truth.

import { z } from 'zod';
import { CaseCategory } from '@citizen-shield/types';

export const caseCategorySchema = z.nativeEnum(CaseCategory);

export const partySchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
});
export type PartyInput = z.infer<typeof partySchema>;

export const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  priority: z.number().int().min(0).max(10),
});
export type QuestionInput = z.infer<typeof questionSchema>;

/**
 * The running extraction. Every field except `keyFacts` and `parties`
 * is optional — the assistant fills them in across multiple turns.
 * `keyFacts` and `parties` are arrays that grow monotonically.
 */
export const extractedFactsSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  category: caseCategorySchema.optional(),
  keyFacts: z.array(z.string()),
  parties: z.array(partySchema),
  timeline: z.string().optional(),
  desiredOutcome: z.string().optional(),
});
export type ExtractedFactsInput = z.infer<typeof extractedFactsSchema>;

/**
 * Final draft presented on the confirm page. All three fields are
 * required — the user reviews the summary of the conversation and
 * edits anything that's off.
 */
export const caseDraftSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: caseCategorySchema,
});
export type CaseDraftInput = z.infer<typeof caseDraftSchema>;

/**
 * Single message row stored in `Conversation.messages`.
 */
export const intakeMessageRowSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  ts: z.string(),
});
export type IntakeMessageRow = z.infer<typeof intakeMessageRowSchema>;

export const intakeMessagesSchema = z.array(intakeMessageRowSchema);

/**
 * The single AI turn response. The provider must produce a JSON
 * object of exactly this shape; `safeParseAiResponse` rejects
 * anything else. `confidence` is the model's self-rated certainty
 * that the extraction is complete enough to confirm; the reducer
 * uses it (combined with `isReadyToConfirm`) to decide whether to
 * surface the confirm CTA.
 */
export const aiTurnResponseSchema = z.object({
  assistantMessage: z.string().min(1),
  stateUpdate: extractedFactsSchema.partial(),
  detectedCategory: caseCategorySchema.nullable(),
  isReadyToConfirm: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type AiTurnResponseInput = z.infer<typeof aiTurnResponseSchema>;
