'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SafeUser } from '@citizen-shield/types';
import type { AuthResponse } from '@citizen-shield/validation';
import {
  clearAccessToken,
  getCurrentUser,
  notifyUnauthorized,
  onUnauthorized,
  setAccessToken,
  setCurrentUser,
} from '@/lib/auth-store';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';

export type AuthStatus = 'loading' | 'authed' | 'guest';

export interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  login: (input: { email: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  register: (input: {
    email: string;
    password: string;
    name: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SafeUser | null>(getCurrentUser());
  const router = useRouter();

  const applyAuth = useCallback((response: AuthResponse) => {
    // Coerce dates to ISO strings so the in-memory user matches Prisma's
    // SafeUser (which expects Date) and stays serializable across re-renders.
    const user: SafeUser = {
      ...response.user,
      createdAt: new Date(response.user.createdAt),
      updatedAt: new Date(response.user.updatedAt),
    };
    setAccessToken(response.accessToken);
    setCurrentUser(user);
    setUser(user);
    setStatus('authed');
  }, []);

  const refresh = useCallback(async () => {
    // Try to refresh the access token via the HttpOnly cookie.
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}${ENDPOINTS.auth.refresh}`,
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) {
      clearAccessToken();
      setCurrentUser(null);
      setUser(null);
      setStatus('guest');
      return;
    }
    const json = (await res.json()) as { data?: AuthResponse | null };
    if (json.data) {
      applyAuth(json.data);
    } else {
      clearAccessToken();
      setCurrentUser(null);
      setUser(null);
      setStatus('guest');
    }
  }, [applyAuth]);

  // Bootstrap on mount: try /auth/refresh once.
  useEffect(() => {
    void refresh();
    const handler = (): void => {
      clearAccessToken();
      setCurrentUser(null);
      setUser(null);
      setStatus('guest');
    };
    onUnauthorized(handler);
    return () => {
      onUnauthorized(() => undefined);
    };
  }, [refresh]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      const res = await api<AuthResponse>(ENDPOINTS.auth.login, {
        method: 'POST',
        body: input,
        skipAuth: true,
      });
      if (!res.ok) {
        return { ok: false, error: res.error.message };
      }
      if (res.data) {
        applyAuth(res.data);
      }
      return { ok: true };
    },
    [applyAuth],
  );

  const register = useCallback<AuthContextValue['register']>(
    async (input) => {
      const res = await api<AuthResponse>(ENDPOINTS.auth.register, {
        method: 'POST',
        body: input,
        skipAuth: true,
      });
      if (!res.ok) {
        return { ok: false, error: res.error.message };
      }
      if (res.data) {
        applyAuth(res.data);
      }
      return { ok: true };
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    await api<null>(ENDPOINTS.auth.logout, { method: 'POST' });
    clearAccessToken();
    setCurrentUser(null);
    setUser(null);
    setStatus('guest');
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, refresh }),
    [status, user, login, register, logout, refresh],
  );

  // Suppress unused-warning for notifyUnauthorized (kept exported for tests).
  void notifyUnauthorized;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
