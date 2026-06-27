// Auth primitives — JWT signing/verification + Argon2 password hashing.
//
// `jose` is used over `jsonwebtoken` because it has first-class TypeScript
// support, no `any`, and is what most modern stacks reach for. The backend
// wraps these in a NestJS service; the rest of the codebase can also use
// them directly.

import { env } from '@citizen-shield/config';
import { UserRole, type AuthRole } from '@citizen-shield/types';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';

// -----------------------------------------------------------------------------
// Token lifetimes.
// -----------------------------------------------------------------------------

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// -----------------------------------------------------------------------------
// JWT payload and helpers.
// -----------------------------------------------------------------------------

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: AuthRole;
  // Optional standard JWT claims that jose adds after verification.
  iat?: number;
  exp?: number;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ ok: true; payload: JwtPayload } | { ok: false; reason: 'expired' | 'invalid' }> {
  try {
    const { payload } = await jwtVerify<JwtPayload>(token, secret, {
      algorithms: ['HS256'],
    });
    const sub = payload.sub;
    const email = payload.email;
    const role = payload.role;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, payload: { ...payload, sub, email, role: role as AuthRole } };
  } catch (err) {
    // jose throws `JWTExpired` (with code `ERR_JWT_EXPIRED`) when the token
    // expired but is otherwise well-formed. Anything else (bad signature,
    // malformed JWT, wrong algorithm) is treated as `invalid`.
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

// -----------------------------------------------------------------------------
// Refresh tokens (opaque random strings; never JWTs).
// -----------------------------------------------------------------------------

/** A refresh token is a 32-byte random string, base64url-encoded. */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// -----------------------------------------------------------------------------
// Argon2 password hashing.
// -----------------------------------------------------------------------------

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Cookie helpers for the refresh token.
// -----------------------------------------------------------------------------

export const REFRESH_COOKIE_NAME = 'cs_refresh';

export interface RefreshCookieOptions {
  secure: boolean;
  maxAgeSeconds: number;
}

export function buildRefreshCookie(token: string, opts: RefreshCookieOptions): string {
  // HttpOnly, SameSite=Lax, Path=/. Secure is on whenever the env is non-dev.
  const flags = [
    `${REFRESH_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAgeSeconds}`,
  ];
  if (opts.secure) flags.push('Secure');
  return flags.join('; ');
}

export function buildClearRefreshCookie(secure: boolean): string {
  const flags = [`${REFRESH_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) flags.push('Secure');
  return flags.join('; ');
}

// -----------------------------------------------------------------------------
// Redis key helper for refresh tokens.
//
// The actual implementation uses `auth:refresh:index:<tokenId>` (see
// `auth.service.ts`); the value is `<userId>:<secret>`. This constant is
// exported so tests and tooling can namespace their keys consistently.
// -----------------------------------------------------------------------------

export const REFRESH_REDIS_PREFIX = 'auth:refresh';

// Re-export UserRole enum via @citizen-shield/types for convenience.
export { UserRole };
