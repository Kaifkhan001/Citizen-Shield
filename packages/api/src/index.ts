// Shared API surface — endpoint constants + Result type.
//
// Apps should never hardcode path strings; import from here so a rename in
// the backend is a single-place change.

export type {
  ApiSuccess,
  ApiFailure,
  ApiResponse,
  SafeUser,
  AuthUser,
} from '@citizen-shield/types';
export * from '@citizen-shield/validation';
export {
  ErrorCode,
  ErrorStatus,
  ErrorMessage,
  isTransportCode,
  getStatusForCode,
  getMessageForCode,
} from '@citizen-shield/errors';
export type { ErrorCode as ErrorCodeType } from '@citizen-shield/errors';

export const ENDPOINTS = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  cases: {
    list: '/cases',
    create: '/cases',
    detail: (id: string) => `/cases/${id}`,
    update: (id: string) => `/cases/${id}`,
    remove: (id: string) => `/cases/${id}`,
  },
  intake: {
    start: '/intake/start',
    detail: (id: string) => `/intake/${id}`,
    message: (id: string) => `/intake/${id}/message`,
    confirm: (id: string) => `/intake/${id}/confirm`,
    abort: (id: string) => `/intake/${id}/abort`,
  },
  health: '/health',
} as const;

/**
 * Result type for the frontend's API client. We never throw on HTTP errors —
 * callers branch on `ok`.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
