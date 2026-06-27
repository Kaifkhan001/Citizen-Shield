# Authentication

This document covers how Citizen Shield handles authentication in Milestone 3 (M3). It is the source of truth for token lifetimes, storage, rotation, and request validation. The API surface is documented separately in [`docs/api.md`](./api.md).

## Token model

Two tokens, distinct lifetimes, distinct storage:

| Token         | Lifetime | Storage                                          | Purpose                             |
| ------------- | -------- | ------------------------------------------------ | ----------------------------------- |
| Access token  | 15 min   | In-memory (browser tab) + `Authorization` header | Authenticates API requests          |
| Refresh token | 7 days   | `HttpOnly` + `Secure` + `SameSite=Lax` cookie    | Mints a fresh access + refresh pair |

Both are JWTs signed with HS256. The signing secret lives in `JWT_SECRET` (see `packages/config`). Access tokens carry `{ sub, role, email }`; refresh tokens carry the same payload plus a `jti` (token id) used for rotation tracking.

## Why two tokens

Access tokens must be sent on every request, so they need to be readable by JavaScript — they live in memory and travel as `Authorization: Bearer <jwt>`. If an XSS bug leaks the access token, the attacker has at most 15 minutes of access and a hard refresh wipes the in-memory copy.

Refresh tokens cannot be read by JavaScript. They ride in an `HttpOnly` cookie, so an XSS payload cannot exfiltrate them. They are only sent to `/auth/refresh` and `/auth/logout`.

## Endpoints

| Route                | Method | Auth required | Throttle   |
| -------------------- | ------ | ------------- | ---------- |
| `/api/auth/register` | POST   | No            | 5 / minute |
| `/api/auth/login`    | POST   | No            | 5 / minute |
| `/api/auth/refresh`  | POST   | Cookie only   | 5 / minute |
| `/api/auth/logout`   | POST   | Yes           | standard   |
| `/api/auth/me`       | GET    | Yes           | standard   |

All five endpoints respond with the standard envelope (`{ success, data }` / `{ success: false, error: { code, message } }`). See [`docs/api.md`](./api.md) for the full request and response shapes.

## Refresh token rotation

Refresh tokens are **rotated on every use**. The lifecycle:

1. **Register / login.** Backend issues an access token (returned in JSON) and a refresh token (set as the `cs_refresh` cookie). The refresh token's `jti` is stored in Redis under `auth:refresh:<userId>:<jti>` with a 7-day TTL.
2. **Authenticated request.** The browser sends the access token in `Authorization`. The backend verifies the JWT and returns the response. No Redis call.
3. **Access token expires.** The next API request returns `401 UNAUTHORIZED`.
4. **Silent refresh.** The browser posts to `/auth/refresh` with the cookie. The backend:
   - Verifies the JWT signature and expiry.
   - Looks up `auth:refresh:<userId>:<jti>` in Redis. If missing → `401`, cookie is cleared.
   - **Atomically deletes the old key** and writes a new key `auth:refresh:<userId>:<newJti>` with a fresh 7-day TTL.
   - Issues a new access token and a new refresh cookie.
5. **Subsequent requests** use the new access token. The old refresh cookie is overwritten by the response.

If a refresh cookie is replayed after rotation (the old `jti` is no longer in Redis), the backend rejects it with `401` and clears the cookie. Replay attempts are logged.

## Logout

`/auth/logout` (with the access token in `Authorization`) deletes `auth:refresh:<userId>:<jti>` from Redis, then returns `204`. The browser clears its in-memory access token and the `AuthProvider` redirects to `/login`.

If the user has no access token but still has the cookie, `/auth/logout` still clears the cookie and the Redis key.

## Password hashing

Passwords are hashed with **argon2id** (`argon2` npm package). Plaintext passwords are never stored, never logged, and never returned in any response. The `SafeUser` type strips `passwordHash` before it leaves the backend.

## Route protection (backend)

Every protected route uses `@UseGuards(JwtAuthGuard)`. The guard:

1. Reads `Authorization: Bearer <jwt>`.
2. Verifies via `@nestjs/jwt`.
3. Attaches `{ userId, role, email }` to `request.user`.

Controllers read the current user via the `@CurrentUser()` decorator. Ownership checks (e.g. "is this case owned by the calling user?") live in the **service** layer, not the guard, so they can return `404` instead of `403` when the user shouldn't even know the resource exists.

`@Roles('ADMIN')` is opt-in per route via `RolesGuard`. There are no admin-only routes in M3, but the wiring is in place for M4.

## Route protection (frontend)

Next.js middleware (`apps/web/src/middleware.ts`) gates `/dashboard/*` and `/cases/*` based on the presence of the `cs_refresh` cookie. This is a **UX speedup**, not a security boundary:

- If the cookie is missing, the middleware redirects to `/login?next=<path>`.
- If the cookie is present, the middleware lets the request through.

Actual JWT verification happens on the client when `AuthProvider` mounts and calls `/auth/refresh`. If the cookie is stale, the refresh fails, `AuthProvider` clears state, and the user lands on `/login`. So a stale cookie just causes one wasted redirect — never an unauthorized data leak.

`AuthProvider` exposes:

```ts
const { status, user, login, register, logout, refresh } = useAuth();
```

`status` is `'loading' | 'authed' | 'guest'`. Components gate on this before rendering protected content.

## Silent refresh on 401

`apps/web/src/lib/api.ts` is a thin fetch wrapper. On any `401`, it:

1. Calls `/auth/refresh` once (cookie travels automatically).
2. If the refresh succeeds, retries the original request with the new access token.
3. If the refresh fails, clears the in-memory token and notifies `AuthProvider` (which flips to `'guest'`).

Parallel 401s from the same page are coalesced — only one `/auth/refresh` is in flight at a time. Subsequent 401s piggyback on the same promise.

## Configuration

| Env var                     | Default                                   | Purpose                                       |
| --------------------------- | ----------------------------------------- | --------------------------------------------- |
| `JWT_SECRET`                | (required)                                | HS256 secret for both access and refresh JWTs |
| `ACCESS_TOKEN_TTL_SECONDS`  | `900`                                     | Access token lifetime                         |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800`                                  | Refresh token lifetime                        |
| `WEB_ORIGINS`               | `http://localhost:3000` (comma-separated) | CORS allowlist for the frontend               |
| `COOKIE_SECURE`             | `false` in dev, `true` otherwise          | Set the `Secure` flag on the refresh cookie   |

Production must set `COOKIE_SECURE=true` (or rely on `NODE_ENV=production` flipping it).

## Threat model (brief)

| Threat                          | Mitigation                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| Stolen access token (XSS)       | 15-minute TTL + in-memory only (cleared on hard refresh)            |
| Stolen refresh token (XSS)      | `HttpOnly` flag, so XSS can't read it                               |
| Replay of an old refresh token  | Atomic Redis delete on rotation; replay returns 401                 |
| CSRF on `/auth/refresh`         | `SameSite=Lax` cookie + custom header check (added in M4 if needed) |
| Brute-force login               | 5 / minute throttler on all auth routes                             |
| Password breach (database leak) | argon2id; rotate hash on next login if you want belt-and-braces     |

CSRF for `/auth/refresh` is currently mitigated by `SameSite=Lax` only. For M4, add a custom-header check (e.g. `X-Requested-With`) or a double-submit token if the frontend ever embeds in a context where `Lax` is not enough.

## What's NOT in M3

- Email verification
- Password reset
- Multi-factor auth
- OAuth / social login
- Admin role UI

These are M4+ candidates.
