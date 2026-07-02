import { z } from 'zod';
import { CaseCategory, CaseStatus, UserRole } from '@citizen-shield/types';

// -----------------------------------------------------------------------------
// Shared primitives.
// -----------------------------------------------------------------------------

// UUID v4 validator for route params (e.g. `/cases/:id`). Surfaces a clear
// 400 VALIDATION_ERROR instead of a 500 from Prisma's `Invalid UUID` error.
export const uuidSchema = z.string().uuid('Invalid id');

// -----------------------------------------------------------------------------
// Health (kept from M1).
// -----------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string().datetime().optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// -----------------------------------------------------------------------------
// API envelope — generic over a payload schema.
// -----------------------------------------------------------------------------

export const apiFailureSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiFailure = z.infer<typeof apiFailureSchema>;

export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}
export type ApiSuccess<T> = { success: true; data: T };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// -----------------------------------------------------------------------------
// Auth.
// -----------------------------------------------------------------------------

export const emailSchema = z.string().email('Invalid email address').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const safeUserSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: z.string(),
  role: z.nativeEnum(UserRole),
  createdAt: z.string().datetime().or(z.date()),
  updatedAt: z.string().datetime().or(z.date()),
});
export type SafeUserDto = z.infer<typeof safeUserSchema>;

export const authResponseSchema = z.object({
  user: safeUserSchema,
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// -----------------------------------------------------------------------------
// Cases.
// -----------------------------------------------------------------------------

export const caseCategorySchema = z.nativeEnum(CaseCategory);
export const caseStatusSchema = z.nativeEnum(CaseStatus);

export const createCaseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  category: caseCategorySchema,
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(5000).optional(),
    category: caseCategorySchema.optional(),
    status: caseStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const caseResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: caseCategorySchema,
  status: caseStatusSchema,
  userId: z.string().uuid(),
  createdAt: z.string().datetime().or(z.date()),
  updatedAt: z.string().datetime().or(z.date()),
});
export type CaseResponse = z.infer<typeof caseResponseSchema>;

export const caseListResponseSchema = z.array(caseResponseSchema);
export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

// -----------------------------------------------------------------------------
// AI intake (M4).
//
// These schemas mirror the discriminated union in
// @citizen-shield/ai/src/state.ts. The frontend and the backend both
// import from here so the wire shape is the only source of truth.
// -----------------------------------------------------------------------------

// Re-export of the AI package's chat-row schema (small, no Prisma dep).
export const intakeMessageRowSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  ts: z.string(),
});
export type IntakeMessageRowDto = z.infer<typeof intakeMessageRowSchema>;

export const intakeMessagesSchema = z.array(intakeMessageRowSchema);

// ExtractedFacts — what the running AI extraction looks like.
export const partySchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
});

export const extractedFactsSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  category: caseCategorySchema.optional(),
  keyFacts: z.array(z.string()),
  parties: z.array(partySchema),
  timeline: z.string().optional(),
  desiredOutcome: z.string().optional(),
});
export type ExtractedFactsDto = z.infer<typeof extractedFactsSchema>;

// Final draft — what the user reviews on the confirm page.
export const caseDraftSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  category: caseCategorySchema,
});
export type CaseDraftDto = z.infer<typeof caseDraftSchema>;

// ConversationState — discriminated union mirroring the reducer.
const startedStateSchema = z.object({ kind: z.literal('started') });
const gatheringProblemStateSchema = z.object({
  kind: z.literal('gathering_problem'),
  turnCount: z.number().int().min(0),
  lastUserMessage: z.string().nullable(),
});
const gatheringCategoryStateSchema = z.object({
  kind: z.literal('gathering_category'),
  candidates: z.array(caseCategorySchema),
});
const gatheringFactsStateSchema = z.object({
  kind: z.literal('gathering_facts'),
  facts: extractedFactsSchema,
});
const gatheringFollowupsStateSchema = z.object({
  kind: z.literal('gathering_followups'),
  pendingQuestions: z.array(
    z.object({ id: z.string(), prompt: z.string(), priority: z.number().int().min(0).max(10) }),
  ),
  facts: extractedFactsSchema,
});
const readyToConfirmStateSchema = z.object({
  kind: z.literal('ready_to_confirm'),
  draft: caseDraftSchema,
  facts: extractedFactsSchema,
});
const confirmedStateSchema = z.object({
  kind: z.literal('confirmed'),
  caseId: z.string().uuid(),
});
const failedStateSchema = z.object({
  kind: z.literal('failed'),
  reason: z.string(),
});

export const conversationStateSchema = z.discriminatedUnion('kind', [
  startedStateSchema,
  gatheringProblemStateSchema,
  gatheringCategoryStateSchema,
  gatheringFactsStateSchema,
  gatheringFollowupsStateSchema,
  readyToConfirmStateSchema,
  confirmedStateSchema,
  failedStateSchema,
]);
export type ConversationStateDto = z.infer<typeof conversationStateSchema>;

// Wire envelope for `GET /api/intake/:id` and the `POST /:id/message` response.
export const conversationResponseSchema = z.object({
  id: z.string().uuid(),
  state: conversationStateSchema,
  messages: intakeMessagesSchema,
  extracted: extractedFactsSchema,
  category: caseCategorySchema.nullable(),
  caseId: z.string().uuid().nullable(),
  createdAt: z.string().datetime().or(z.date()),
  updatedAt: z.string().datetime().or(z.date()),
});
export type ConversationResponse = z.infer<typeof conversationResponseSchema>;

// API request schemas.
export const intakeStartRequestSchema = z.object({
  initialMessage: z.string().min(1).max(2000).optional(),
});
export type IntakeStartRequest = z.infer<typeof intakeStartRequestSchema>;

export const intakeMessageRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
});
export type IntakeMessageRequest = z.infer<typeof intakeMessageRequestSchema>;

export const intakeAbortRequestSchema = z.object({
  reason: z.string().min(1).max(200).default('user_aborted'),
});
export type IntakeAbortRequest = z.infer<typeof intakeAbortRequestSchema>;

// API response schemas.
export const intakeMessageResponseSchema = z.object({
  conversation: conversationResponseSchema,
  assistantMessage: z.string(),
});
export type IntakeMessageResponse = z.infer<typeof intakeMessageResponseSchema>;

export const intakeConfirmResponseSchema = z.object({
  caseId: z.string().uuid(),
  case: caseResponseSchema,
});
export type IntakeConfirmResponse = z.infer<typeof intakeConfirmResponseSchema>;

// AI's structured turn response (Zod-validated against the AI provider).
// Re-exported for completeness; the source of truth is @citizen-shield/ai.
export {
  aiTurnResponseSchema,
  caseDraftSchema as aiCaseDraftSchema,
  extractedFactsSchema as aiExtractedFactsSchema,
  questionSchema as aiQuestionSchema,
} from '@citizen-shield/ai';
