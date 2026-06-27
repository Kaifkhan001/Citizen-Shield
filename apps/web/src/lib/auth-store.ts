// In-memory access token store. The refresh token lives in an HttpOnly
// cookie managed by the backend; the access token is short-lived and kept
// in a module-level variable so React components can read it without
// re-render churn. The variable is reset on hard refresh (intentional —
// the AuthProvider bootstraps from /auth/refresh on mount).

import type { SafeUser } from '@citizen-shield/types';

let accessToken: string | null = null;
let currentUser: SafeUser | null = null;
let unauthorizedListener: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function getCurrentUser(): SafeUser | null {
  return currentUser;
}

export function setCurrentUser(user: SafeUser | null): void {
  currentUser = user;
}

export function onUnauthorized(listener: () => void): void {
  unauthorizedListener = listener;
}

export function notifyUnauthorized(): void {
  unauthorizedListener?.();
}
