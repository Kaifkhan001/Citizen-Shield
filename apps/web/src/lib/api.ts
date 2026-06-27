// Thin client-side fetch wrapper around the Citizen Shield backend.
//
// Responsibilities:
// - Attach the access token from the in-memory auth store on every request.
// - Send `credentials: 'include'` so the HttpOnly refresh cookie travels.
// - On a 401, attempt one silent refresh; on the second 401, hand the user
//   back to the caller as `unauthenticated`.
// - Decode the `{ success, data }` / `{ success: false, error }` envelope
//   so callers always receive a typed `Result<T>` rather than a thrown
//   error.
//
// This file is browser-only — it touches `document.cookie` and the
// in-memory store.

import { ENDPOINTS, type Result } from '@citizen-shield/api';
import { clearAccessToken, getAccessToken, notifyUnauthorized, setAccessToken } from './auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  // When true, skip the access-token attachment (used for /auth/login,
  // /auth/register, /auth/refresh).
  skipAuth?: boolean;
  // When true, don't retry via /auth/refresh on 401.
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<Result<T>> {
  // First attempt.
  const first = await raw<T>(path, opts);
  if (first.ok || opts.skipAuth || opts.skipRefresh) {
    return first;
  }
  if (first.error.code !== 'UNAUTHORIZED') {
    return first;
  }

  // Try a silent refresh.
  const refreshed = await silentRefresh();
  if (!refreshed) {
    clearAccessToken();
    notifyUnauthorized();
    return first;
  }

  // Second attempt — should now succeed with the fresh access token.
  const second = await raw<T>(path, opts);
  if (!second.ok && second.error.code === 'UNAUTHORIZED') {
    clearAccessToken();
    notifyUnauthorized();
  }
  return second;
}

async function raw<T>(path: string, opts: ApiOptions): Promise<Result<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.skipAuth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    return {
      ok: false,
      error: { code: 'NETWORK_ERROR', message: (err as Error).message },
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      error: { code: 'BAD_RESPONSE', message: `HTTP ${res.status}` },
    };
  }

  if (!res.ok) {
    const errorBody = json as { error?: { code?: string; message?: string } };
    return {
      ok: false,
      error: {
        code: errorBody.error?.code ?? 'HTTP_ERROR',
        message: errorBody.error?.message ?? `HTTP ${res.status}`,
      },
    };
  }

  // Success envelope: `{ success: true, data: T }`.
  const successBody = json as { data?: T };
  return { ok: true, data: successBody.data as T };
}

let refreshInFlight: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  // Coalesce parallel 401s into a single refresh call.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}${ENDPOINTS.auth.refresh}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { data?: { accessToken?: string } };
      const token = json.data?.accessToken;
      if (!token) return false;
      setAccessToken(token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
