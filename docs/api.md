# API Reference — Milestone 3

All routes are mounted under the `/api` prefix. Every response is JSON and uses one of two envelopes:

```ts
// Success
{ "success": true, "data": <T> }

// Failure
{ "success": false, "error": { "code": string, "message": string } }
```

The Zod schemas for every request and response live in `@citizen-shield/validation`. They are the source of truth — this doc summarizes the wire shape.

## Error codes

| HTTP | `code`             | When                                                          |
| ---- | ------------------ | ------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` | Request body or params failed Zod validation                  |
| 401  | `UNAUTHORIZED`     | Missing / invalid / expired access or refresh token           |
| 403  | `FORBIDDEN`        | Authed but lacks the role for the resource                    |
| 404  | `NOT_FOUND`        | Resource doesn't exist OR caller doesn't own it               |
| 409  | `CONFLICT`         | Unique constraint violation (e.g. email already registered)   |
| 429  | `RATE_LIMITED`     | Throttler trip — see [authentication.md](./authentication.md) |
| 500  | `INTERNAL_ERROR`   | Unhandled server error                                        |

The frontend's `api()` wrapper always returns a `Result<T>`:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
```

HTTP-level throws (network down, CORS) become `{ ok: false, error: { code: 'NETWORK_ERROR', ... } }`.

## Common headers

| Header          | Sent on                | Purpose                                  |
| --------------- | ---------------------- | ---------------------------------------- |
| `Authorization` | Authed requests        | `Bearer <access token>`                  |
| `Cookie`        | Requests to `/refresh` | Carries the `cs_refresh` HttpOnly cookie |
| `Content-Type`  | All requests with body | `application/json`                       |

## Auth

### POST `/api/auth/register`

Create a new account.

**Request**

```json
{ "email": "you@example.com", "password": "correct horse battery staple", "name": "You" }
```

Validation: email is RFC-shaped; password is ≥ 12 chars; name is 1–80 chars.

**Response 201**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cl...",
      "email": "you@example.com",
      "name": "You",
      "role": "USER",
      "createdAt": "2026-06-26T12:34:56.789Z",
      "updatedAt": "2026-06-26T12:34:56.789Z"
    },
    "accessToken": "ey..."
  }
}
```

**Side effects:** Sets the `cs_refresh` cookie.

**Errors**

- `409 CONFLICT` — email already registered.

### POST `/api/auth/login`

Exchange credentials for tokens.

**Request**

```json
{ "email": "you@example.com", "password": "correct horse battery staple" }
```

**Response 200** — same shape as `/auth/register`.

**Side effects:** Sets the `cs_refresh` cookie.

**Errors**

- `401 UNAUTHORIZED` — wrong email or password.

### POST `/api/auth/refresh`

Mint a fresh access + refresh pair. The browser must send the `cs_refresh` cookie.

**Request** — empty body. Cookie is the auth.

**Response 200** — same shape as `/auth/register`. A new `cs_refresh` cookie replaces the old one.

**Errors**

- `401 UNAUTHORIZED` — cookie missing, signature invalid, expired, rotated (jti not in Redis), or unknown user.

### POST `/api/auth/logout`

Invalidate the current refresh token.

**Request** — empty body. Access token in `Authorization`; refresh cookie is also fine.

**Response 204** — empty body. The `cs_refresh` cookie is cleared by the response.

**Errors**

- `401 UNAUTHORIZED` — only if no refresh cookie AND no access token; otherwise succeeds idempotently.

### GET `/api/auth/me`

Return the current user.

**Request** — access token in `Authorization`.

**Response 200**

```json
{
  "success": true,
  "data": {
    "id": "cl...",
    "email": "you@example.com",
    "name": "You",
    "role": "USER",
    "createdAt": "2026-06-26T12:34:56.789Z",
    "updatedAt": "2026-06-26T12:34:56.789Z"
  }
}
```

`passwordHash` is never included — this is the `SafeUser` shape.

## Cases

All `/api/cases/*` routes require `Authorization: Bearer <access token>`. Users only see their own cases. Accessing another user's case returns `404`, not `403`, so the case id space isn't enumerable.

### POST `/api/cases`

Create a new case.

**Request**

```json
{
  "title": "Refund denied for defective headphones",
  "description": "Bought them on 2026-05-01. Left ear stopped working after 2 weeks.",
  "category": "CONSUMER_COMPLAINT"
}
```

Validation: title 3–120 chars; description 10–5000 chars; category must be a known enum (`CONSUMER_COMPLAINT` or `EMPLOYMENT_DISPUTE` in M3).

**Response 201**

```json
{
  "success": true,
  "data": {
    "id": "cl...",
    "title": "Refund denied for defective headphones",
    "description": "Bought them on 2026-05-01. Left ear stopped working after 2 weeks.",
    "category": "CONSUMER_COMPLAINT",
    "status": "DRAFT",
    "userId": "cl...",
    "createdAt": "2026-06-26T12:34:56.789Z",
    "updatedAt": "2026-06-26T12:34:56.789Z",
    "deletedAt": null
  }
}
```

The case is owned by the calling user (`userId` matches `sub` from the JWT).

### GET `/api/cases`

List cases owned by the calling user.

**Response 200**

```json
{
  "success": true,
  "data": [
    { "id": "cl...", "title": "...", "category": "CONSUMER_COMPLAINT", "status": "DRAFT", ... },
    { "id": "cl...", "title": "...", "category": "EMPLOYMENT_DISPUTE", "status": "OPEN", ... }
  ]
}
```

Soft-deleted cases are excluded. Pagination is not implemented in M3.

### GET `/api/cases/:id`

Fetch a single case.

**Response 200** — single `CaseResponse` shape.

**Errors**

- `404 NOT_FOUND` — case doesn't exist OR belongs to another user.

### PATCH `/api/cases/:id`

Update a case. All fields optional; supply only what changes.

**Request**

```json
{ "title": "Updated title", "status": "OPEN" }
```

Validation mirrors the create schema. `status` must be a known enum (`DRAFT`, `OPEN`, `CLOSED`).

**Response 200** — updated `CaseResponse`.

**Errors**

- `404 NOT_FOUND` — same as `GET`.

### DELETE `/api/cases/:id`

Soft-delete a case.

**Response 204** — empty body.

**Side effects:** Sets `deletedAt` to `now()`. The row is hidden from `GET /cases` and `GET /cases/:id`. There is no hard-delete in M3.

**Errors**

- `404 NOT_FOUND` — same as `GET`.

## Health

### GET `/api/health`

Public liveness probe.

**Response 200**

```json
{
  "success": true,
  "data": {
    "service": "citizen-shield-api",
    "status": "ok",
    "timestamp": "2026-06-26T12:34:56.789Z"
  }
}
```

## Versioning

There is no version prefix in M3. Routes are pinned to `/api/*`. When breaking changes land in M4+, expect a `/api/v1/*` namespace introduced behind a single global prefix; existing routes will be deprecated in place for one milestone and removed in the milestone after.

## OpenAPI

A machine-readable spec is **not** generated in M3. The Zod schemas in `@citizen-shield/validation` are the contract — they are imported by both the backend (for parsing) and the frontend (for typing responses). An OpenAPI generator is a candidate for M4.

## What's NOT in M3

- Pagination / filtering / search on `/cases`
- Evidence, timeline, complaint routes (stubs only)
- Webhooks
- File uploads

See the M3 plan in the conversation history and `docs/architecture.md` for the broader scope.
