# Authentication

This document covers how Citizen Shield handles authentication in Milestones 3 / 3.5. It is the source of truth for token lifetimes, storage, rotation, and request validation. The API surface is documented separately in [`docs/api.md`](./api.md).

## Token model

Two tokens, distinct lifetimes, distinct storage, distinct shapes:

| Token         | Lifetime | Shape                               | Storage                                          | Purpose                             |
| ------------- | -------- | ----------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Access token  | 15 min   | JWT signed with HS256 (`jose`)      | In-memory (browser tab) + `Authorization` header | Authenticates API requests          |
| Refresh token | 7 days   | Opaque random string (`<id>.<sec>`) | `HttpOnly` + `Secure` + `SameSite=Lax` cookie    | Mints a fresh access + refresh pair |

The access token is a JWT carrying `{ sub, email, role }`. The refresh token is **not** a JWT — it is a 32-byte random string (base64url-encoded), split into a public `<tokenId>` and a private `<secret>`. Only the `tokenId` is recoverable from the cookie; the full token is required to authenticate against Redis.

The signing secret for the access JWT lives in `JWT_SECRET` (see `packages/config`).

## Why two tokens (and two shapes)

Access tokens must be sent on every request, so they need to be readable by JavaScript — they live in memory and travel as `Authorization: Bearer <jwt>`. If an XSS bug leaks the access token, the attacker has at most 15 minutes of access and a hard refresh wipes the in-memory copy.

Refresh tokens cannot be read by JavaScript. They ride in an `HttpOnly` cookie, so an XSS payload cannot exfiltrate them. They are only sent to `/auth/refresh` and `/auth/logout`. Because they are opaque strings (not JWTs), there is no chance of accidentally trusting a forged signature — every refresh must hit Redis.

## Endpoints

| Route                | Method | Auth required | Throttle                    |
| -------------------- | ------ | ------------- | --------------------------- |
| `/api/auth/register` | POST   | No            | `AUTH_RATE_LIMIT_*` (5/min) |
| `/api/auth/login`    | POST   | No            | `AUTH_RATE_LIMIT_*` (5/min) |
| `/api/auth/refresh`  | POST   | Cookie only   | `AUTH_RATE_LIMIT_*` (5/min) |
| `/api/auth/logout`   | POST   | Yes           | global default              |
| `/api/auth/me`       | GET    | Yes           | global default              |

All five endpoints respond with the standard envelope (`{ success, data }` / `{ success: false, error: { code, message, requestId? } }`). See [`docs/api.md`](./api.md) for the full request and response shapes and the error code table.

## Refresh token rotation

Refresh tokens are **rotated on every use**. The lifecycle:

1. **Register / login.** Backend issues an access token (returned in JSON) and a refresh token (set as the `cs_refresh` cookie). The refresh token's `tokenId` is stored in Redis under `auth:refresh:index:<tokenId>` with a 7-day TTL. The stored value is `<userId>:<secret>`.
2. **Authenticated request.** The browser sends the access token in `Authorization`. The backend verifies the JWT and returns the response. No Redis call.
3. **Access token expires.** The next API request returns `401 AUTH_EXPIRED_TOKEN`.
4. **Silent refresh.** The browser posts to `/auth/refresh` with the cookie. The backend:
   - Splits the cookie value into `<tokenId>.<secret>`.
   - Looks up `auth:refresh:index:<tokenId>` in Redis. If missing → `401 AUTH_REFRESH_EXPIRED`, cookie is cleared.
   - Compares the supplied `<secret>` to the stored one. If mismatch → `401 AUTH_REFRESH_EXPIRED`.
   - **Atomically deletes the old key** and writes a new key with a fresh 7-day TTL.
   - Issues a new access token and a new refresh cookie.
5. **Subsequent requests** use the new access token. The old refresh cookie is overwritten by the response.

If a refresh cookie is replayed after rotation (the old `tokenId` is no longer in Redis), the backend rejects it with `401 AUTH_REFRESH_EXPIRED` and clears the cookie. Replay attempts are logged.

## Logout

`/auth/logout` (with the access token in `Authorization`) deletes `auth:refresh:index:<tokenId>` from Redis, then returns `{ success: true, data: null }`. The browser clears its in-memory access token and the `AuthProvider` redirects to `/login`.

If the user has no access token but still has the cookie, `/auth/logout` still clears the cookie and the Redis key.

## Password hashing

Passwords are hashed with **argon2id** (`argon2` npm package) at OWASP-minimum parameters (19 MiB memory, time cost 2, parallelism 1). Plaintext passwords are never stored, never logged, and never returned in any response. The `SafeUser` type strips `passwordHash` before it leaves the backend.

## Error codes from auth endpoints

The frontend's `api()` wrapper switches on `code` (typed via the `ErrorCode` registry in `@citizen-shield/errors`) to decide whether to silent-refresh or to send the user back to `/login`:

| Server-emitted code        | What the frontend does                             |
| -------------------------- | -------------------------------------------------- |
| `AUTH_EXPIRED_TOKEN`       | Silent-refresh once; retry the original request    |
| `AUTH_INVALID_TOKEN`       | Clear local state, redirect to `/login`            |
| `AUTH_UNAUTHORIZED`        | Clear local state, redirect to `/login`            |
| `AUTH_REFRESH_EXPIRED`     | Clear local state, redirect to `/login`            |
| `AUTH_INVALID_CREDENTIALS` | Surface the error (the user typed something wrong) |
| `AUTH_EMAIL_TAKEN`         | Surface the error (registration flow)              |

## Route protection (backend)

Every protected route uses `@UseGuards(JwtAuthGuard)`. The guard:

1. Reads `Authorization: Bearer <jwt>`.
2. Verifies the JWT via `jose` (HS256). Returns:
   - `AUTH_UNAUTHORIZED` if the header is missing/empty.
   - `AUTH_INVALID_TOKEN` if the signature is wrong or the token is malformed.
   - `AUTH_EXPIRED_TOKEN` if the signature is fine but the token is past expiry.
3. Attaches `{ id, email, role }` to `request.user`.

Controllers read the current user via the `@CurrentUser()` decorator. Ownership checks (e.g. "is this case owned by the calling user?") live in the **service** layer, not the guard, so they can return `404 CASE_NOT_FOUND` instead of `403` when the user shouldn't even know the resource exists.

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

| Env var                     | Default                                   | Purpose                              |
| --------------------------- | ----------------------------------------- | ------------------------------------ |
| `JWT_SECRET`                | (required)                                | HS256 secret for access JWTs         |
| `ACCESS_TOKEN_TTL_SECONDS`  | `900`                                     | Access token lifetime                |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800`                                  | Refresh token lifetime               |
| `WEB_ORIGINS`               | `http://localhost:3000` (comma-separated) | CORS allowlist for the frontend      |
| `RATE_LIMIT_TTL`            | `60000` (ms)                              | Global rate-limit window             |
| `RATE_LIMIT_LIMIT`          | `100`                                     | Global requests per window per IP    |
| `AUTH_RATE_LIMIT_TTL`       | `60000` (ms)                              | `/auth/*` rate-limit window          |
| `AUTH_RATE_LIMIT_LIMIT`     | `5`                                       | `/auth/*` requests per window per IP |
| `LOG_LEVEL`                 | `info`                                    | Pino log level                       |

Production must set `JWT_SECRET` to a strong random value. The `Secure` flag on the refresh cookie flips on automatically when `NODE_ENV=production`.

## Threat model (brief)

| Threat                          | Mitigation                                                             |
| ------------------------------- | ---------------------------------------------------------------------- |
| Stolen access token (XSS)       | 15-minute TTL + in-memory only (cleared on hard refresh)               |
| Stolen refresh token (XSS)      | `HttpOnly` flag, so XSS can't read it                                  |
| Replay of an old refresh token  | Atomic Redis delete on rotation; replay returns `AUTH_REFRESH_EXPIRED` |
| CSRF on `/auth/refresh`         | `SameSite=Lax` cookie + the throttle limits replay                     |
| Brute-force login               | `/auth/*` throttler (5 / minute / IP)                                  |
| Password breach (database leak) | argon2id; rotate hash on next login if you want belt-and-braces        |
| Log spam leaking tokens         | `pino` redaction of `authorization`, `cookie`, `set-cookie` headers    |

CSRF for `/auth/refresh` is currently mitigated by `SameSite=Lax` only. For M4, add a custom-header check (e.g. `X-Requested-With`) or a double-submit token if the frontend ever embeds in a context where `Lax` is not enough.

## What's NOT in M3 / M3.5

- Email verification
- Password reset
- Multi-factor auth
- OAuth / social login
- Admin role UI

These are M4+ candidates.
