// @citizen-shield/errors
//
// Single source of truth for the API error envelope. The frontend imports
// the registry (`ErrorCode`, `ErrorStatus`, helpers) from this file. The
// backend additionally imports `ApiError` / `throwWithCode` from
// `./server` — that file pulls in `@nestjs/common`, which transitively
// requires `class-transformer` and is NOT safe to bundle into the web app.
//
// Transport-only codes (`NETWORK_ERROR`, `BAD_RESPONSE`) are produced by
// the frontend's fetch wrapper when the request never reaches the server.
// They have status 0 in `ErrorStatus` (a sentinel meaning "client-side")
// and are never emitted by the backend.
//
// Backward compatibility: the existing M3 codes (UNAUTHORIZED, NOT_FOUND,
// etc.) are retained as aliases of the new scoped codes, so any code
// path that still emits the old literal continues to work and still
// resolves to the correct HTTP status. The aliases are deprecated.

import { z } from 'zod';

// -----------------------------------------------------------------------------
// ErrorCode — string-literal union + const map (single source of truth).
// -----------------------------------------------------------------------------

export const ErrorCode = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
  AUTH_REFRESH_EXPIRED: 'AUTH_REFRESH_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  AUTH_EMAIL_TAKEN: 'AUTH_EMAIL_TAKEN',
  // Cases
  CASE_NOT_FOUND: 'CASE_NOT_FOUND',
  CASE_FORBIDDEN: 'CASE_FORBIDDEN',
  CASE_ALREADY_DELETED: 'CASE_ALREADY_DELETED',
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  // Transport-only (frontend). Status is `0` (sentinel).
  NETWORK_ERROR: 'NETWORK_ERROR',
  BAD_RESPONSE: 'BAD_RESPONSE',

  // Back-compat aliases (deprecated). M3 callers may still emit these.
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// -----------------------------------------------------------------------------
// ErrorStatus — HTTP status for each code. Status 0 = client-side transport.
// -----------------------------------------------------------------------------

export const ErrorStatus: Record<ErrorCode, number> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_INVALID_TOKEN: 401,
  AUTH_EXPIRED_TOKEN: 401,
  AUTH_REFRESH_EXPIRED: 401,
  AUTH_UNAUTHORIZED: 401,
  AUTH_FORBIDDEN: 403,
  AUTH_EMAIL_TAKEN: 409,
  CASE_NOT_FOUND: 404,
  CASE_FORBIDDEN: 404,
  CASE_ALREADY_DELETED: 410,
  VALIDATION_ERROR: 400,
  INTERNAL_SERVER_ERROR: 500,
  RATE_LIMIT_EXCEEDED: 429,
  // Transport-only
  NETWORK_ERROR: 0,
  BAD_RESPONSE: 0,
  // Aliases (deprecated)
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

// -----------------------------------------------------------------------------
// ErrorMessage — neutral default messages. Callers may override per-throw.
// -----------------------------------------------------------------------------

export const ErrorMessage: Record<ErrorCode, string> = {
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password.',
  AUTH_INVALID_TOKEN: 'Authentication token is invalid.',
  AUTH_EXPIRED_TOKEN: 'Authentication token has expired.',
  AUTH_REFRESH_EXPIRED: 'Refresh token has expired. Please sign in again.',
  AUTH_UNAUTHORIZED: 'You must be signed in to perform this action.',
  AUTH_FORBIDDEN: 'You do not have permission to perform this action.',
  AUTH_EMAIL_TAKEN: 'An account with that email already exists.',
  CASE_NOT_FOUND: 'Case not found.',
  CASE_FORBIDDEN: 'You do not have access to this case.',
  CASE_ALREADY_DELETED: 'This case has been deleted.',
  VALIDATION_ERROR: 'Request failed validation.',
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  // Transport-only
  NETWORK_ERROR: 'Network error. Please check your connection.',
  BAD_RESPONSE: 'Server returned an unexpected response.',
  // Aliases
  UNAUTHORIZED: 'You must be signed in to perform this action.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'Resource not found.',
  CONFLICT: 'Resource conflict.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again.',
};

// -----------------------------------------------------------------------------
// Envelope — the failure shape the API always returns.
// -----------------------------------------------------------------------------

export const apiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const apiFailureSchema = z.object({
  success: z.literal(false),
  error: apiErrorBodySchema.extend({
    requestId: z.string().uuid().optional(),
  }),
});
export type ApiFailure = z.infer<typeof apiFailureSchema>;

export interface ApiSuccess<T> {
  success: true;
  data: T;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// -----------------------------------------------------------------------------
// Lookup helpers
// -----------------------------------------------------------------------------

export function getStatusForCode(code: string): number {
  return (ErrorStatus as Record<string, number>)[code] ?? 500;
}

export function getMessageForCode(code: string): string {
  return (ErrorMessage as Record<string, string>)[code] ?? ErrorMessage.INTERNAL_SERVER_ERROR;
}

export function isTransportCode(code: string): boolean {
  return code === ErrorCode.NETWORK_ERROR || code === ErrorCode.BAD_RESPONSE;
}
