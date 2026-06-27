import { z } from 'zod';
import { CaseCategory, CaseStatus, UserRole } from '@citizen-shield/types';

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
