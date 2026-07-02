# API Reference — Milestone 4

All routes are mounted under the `/api` prefix. Every response is JSON and uses one of two envelopes:

```ts
// Success
{ "success": true, "data": <T> }

// Failure
{ "success": false, "error": { "code": string, "message": string, "requestId"?: string } }
```

The Zod schemas for every request and response live in `@citizen-shield/validation`. They are the source of truth — this doc summarizes the wire shape.

The OpenAPI / Swagger UI is mounted at **`/api/docs`** in development (`NODE_ENV !== 'production'`). It is generated live from the controllers via `@nestjs/swagger`.

## Error codes

The single source of truth is `packages/errors/src/index.ts`. The HTTP status column below is derived from `ErrorStatus` and is the canonical mapping.

| HTTP | `code`                         | When                                                          |
| ---- | ------------------------------ | ------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`             | Body, query, or route param failed Zod validation             |
| 400  | `INTAKE_MAX_MESSAGES_EXCEEDED` | User hit `INTAKE_MAX_MESSAGES` on the same conversation       |
| 401  | `AUTH_UNAUTHORIZED`            | Missing / empty `Authorization` header                        |
| 401  | `AUTH_INVALID_CREDENTIALS`     | Wrong email or password                                       |
| 401  | `AUTH_INVALID_TOKEN`           | Access token signature wrong or malformed                     |
| 401  | `AUTH_EXPIRED_TOKEN`           | Access token past expiry (frontend should silent-refresh)     |
| 401  | `AUTH_REFRESH_EXPIRED`         | Refresh cookie missing / revoked / unknown                    |
| 403  | `AUTH_FORBIDDEN`               | Authed but lacks the role for the resource                    |
| 404  | `CASE_NOT_FOUND`               | Case doesn't exist OR caller doesn't own it                   |
| 404  | `INTAKE_NOT_FOUND`             | Conversation doesn't exist OR caller doesn't own it           |
| 409  | `AUTH_EMAIL_TAKEN`             | `User.email` unique constraint violation                      |
| 409  | `INTAKE_INVALID_STATE`         | Conversation is in a terminal state for that operation        |
| 410  | `CASE_ALREADY_DELETED`         | Soft-delete target already deleted                            |
| 429  | `RATE_LIMIT_EXCEEDED`          | Throttler trip — see [authentication.md](./authentication.md) |
| 429  | `AI_RATE_LIMITED`              | AI provider returned 401/403/429                              |
| 502  | `AI_PROVIDER_INVALID_OUTPUT`   | AI returned invalid JSON twice in a row                       |
| 502  | `AI_PROVIDER_UNAVAILABLE`      | AI provider returned a transport error (non-parse)            |
| 500  | `INTERNAL_SERVER_ERROR`        | Unhandled server error (stack trace logged, never returned)   |

The legacy aliases `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR` still resolve to the right status if a caller emits one. New code should use the scoped codes above.

The frontend's `api()` wrapper always returns a `Result<T>`:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
```

HTTP-level throws (network down, CORS) become `{ ok: false, error: { code: 'NETWORK_ERROR', ... } }`. The frontend switches on `code` (typed via the `ErrorCode` registry) to decide whether to silent-refresh (`AUTH_EXPIRED_TOKEN`) or send the user back to `/login`.

## Common headers

| Header          | Sent on                | Purpose                                             |
| --------------- | ---------------------- | --------------------------------------------------- |
| `Authorization` | Authed requests        | `Bearer <access token>`                             |
| `Cookie`        | Requests to `/refresh` | Carries the `cs_refresh` HttpOnly cookie            |
| `Content-Type`  | All requests with body | `application/json`                                  |
| `X-Request-ID`  | Inbound or auto-minted | Echoed on every response; appears in error envelope |

## Auth

### POST `/api/auth/register`

Create a new account.

**Request**

```json
{ "email": "you@example.com", "password": "correct horse battery staple", "name": "You" }
```

Validation: email is RFC-shaped; password is ≥ 8 chars; name is 1–100 chars.

**Response 201**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "you@example.com",
      "name": "You",
      "role": "USER",
      "createdAt": "2026-06-26T12:34:56.789Z",
      "updatedAt": "2026-06-26T12:34:56.789Z"
    },
    "accessToken": "ey...",
    "expiresIn": 900
  }
}
```

**Side effects:** Sets the `cs_refresh` cookie (HttpOnly, `SameSite=Lax`, `Secure` outside dev, 7-day TTL).

**Errors**

- `409 AUTH_EMAIL_TAKEN` — email already registered.

### POST `/api/auth/login`

Exchange credentials for tokens.

**Request**

```json
{ "email": "you@example.com", "password": "correct horse battery staple" }
```

**Response 201** — same shape as `/auth/register`.

**Side effects:** Sets the `cs_refresh` cookie.

**Errors**

- `401 AUTH_INVALID_CREDENTIALS` — wrong email or password.

### POST `/api/auth/refresh`

Mint a fresh access + refresh pair. The browser must send the `cs_refresh` cookie.

**Request** — empty body. Cookie is the auth.

**Response 201** — same shape as `/auth/register`. A new `cs_refresh` cookie replaces the old one (rotation).

**Errors**

- `401 AUTH_REFRESH_EXPIRED` — cookie missing, signature invalid, revoked, rotated, or unknown user.

### POST `/api/auth/logout`

Invalidate the current refresh token.

**Request** — empty body. Access token in `Authorization` is recommended; refresh cookie is also accepted.

**Response 201**

```json
{ "success": true, "data": null }
```

**Side effects:** `cs_refresh` cookie is cleared by the response.

### GET `/api/auth/me`

Return the current user.

**Request** — access token in `Authorization`.

**Response 200**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "you@example.com",
    "name": "You",
    "role": "USER",
    "createdAt": "2026-06-26T12:34:56.789Z",
    "updatedAt": "2026-06-26T12:34:56.789Z"
  }
}
```

`passwordHash` is never included — this is the `SafeUser` shape.

**Errors**

- `401 AUTH_UNAUTHORIZED` — missing token.
- `401 AUTH_INVALID_TOKEN` — bad signature.
- `401 AUTH_EXPIRED_TOKEN` — past expiry (frontend should silent-refresh).

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

Validation: title 1–200 chars; description 1–5000 chars; category must be a known enum (`CONSUMER_COMPLAINT` or `EMPLOYMENT_DISPUTE` in M3).

**Response 201**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Refund denied for defective headphones",
    "description": "Bought them on 2026-05-01. Left ear stopped working after 2 weeks.",
    "category": "CONSUMER_COMPLAINT",
    "status": "DRAFT",
    "userId": "uuid",
    "createdAt": "2026-06-26T12:34:56.789Z",
    "updatedAt": "2026-06-26T12:34:56.789Z"
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
    { "id": "uuid", "title": "...", "category": "CONSUMER_COMPLAINT", "status": "DRAFT", ... },
    { "id": "uuid", "title": "...", "category": "EMPLOYMENT_DISPUTE", "status": "OPEN", ... }
  ]
}
```

Soft-deleted cases are excluded. Pagination is not implemented in M3.

### GET `/api/cases/:id`

Fetch a single case.

**Response 200** — single `CaseResponse` shape.

**Errors**

- `400 VALIDATION_ERROR` — `:id` is not a UUID.
- `404 CASE_NOT_FOUND` — case doesn't exist OR belongs to another user.

### PATCH `/api/cases/:id`

Update a case. All fields optional; supply only what changes.

**Request**

```json
{ "title": "Updated title", "status": "OPEN" }
```

Validation mirrors the create schema. `status` must be a known enum (`DRAFT`, `OPEN`, `EVIDENCE_PENDING`, `READY_FOR_COMPLAINT`, `CLOSED`).

**Response 200** — updated `CaseResponse`.

**Errors**

- `400 VALIDATION_ERROR` — `:id` is not a UUID OR the body is empty.
- `404 CASE_NOT_FOUND` — same as `GET`.

### DELETE `/api/cases/:id`

Soft-delete a case.

**Response 200**

```json
{ "success": true, "data": { "id": "uuid", "deleted": true } }
```

**Side effects:** Sets `deletedAt` to `now()`. The row is hidden from `GET /cases` and `GET /cases/:id`. There is no hard-delete in M3.

**Errors**

- `400 VALIDATION_ERROR` — `:id` is not a UUID.
- `404 CASE_NOT_FOUND` — same as `GET`.

## Health

### GET `/api/health`

Public liveness probe. Does not require auth.

**Response 200**

```json
{
  "success": true,
  "data": {
    "service": "Citizen Shield API",
    "status": "ok",
    "timestamp": "2026-06-26T12:34:56.789Z"
  }
}
```

## Dev tooling

### GET `/api/docs` (development only)

Interactive Swagger UI for the API. Generated live from controller metadata
via `@nestjs/swagger`. The route returns `404` in production.

## Versioning

There is no version prefix in M3/M3.5. Routes are pinned to `/api/*`. When breaking changes land in M4+, expect a `/api/v1/*` namespace introduced behind a single global prefix; existing routes will be deprecated in place for one milestone and removed in the milestone after.

## What's NOT in M3 / M3.5

- Pagination / filtering / search on `/cases`
- Evidence, timeline, complaint routes (stubs only)
- Webhooks
- File uploads

See the M3.5 plan and `docs/architecture.md` for the broader scope.

## M4 — AI intake conversation

All routes are `JwtAuthGuard`-protected and per-route-throttled via
`AI_RATE_LIMIT_TTL` / `AI_RATE_LIMIT_LIMIT`. See
[`docs/ai-intake.md`](./ai-intake.md) for the state machine and
provider model.

### POST `/api/intake/start`

Begin a new intake conversation. Returns the local greeting as the
first assistant message; the conversation is in state
`gathering_problem` immediately.

```json
// Request body (optional)
{ "initialMessage": "My landlord refuses to return my deposit" }

// Response 201
{
  "success": true,
  "data": {
    "conversation": {
      "id": "<uuid>",
      "state": { "kind": "gathering_problem", "turnCount": 0, "lastUserMessage": null },
      "messages": [{ "role": "assistant", "content": "Hi — I'm here...", "ts": "2026-07-01T12:00:00.000Z" }],
      "extracted": { "keyFacts": [], "parties": [] },
      "category": null,
      "caseId": null,
      "createdAt": "2026-07-01T12:00:00.000Z",
      "updatedAt": "2026-07-01T12:00:00.000Z"
    },
    "assistantMessage": "Hi — I'm here to help you file a case. Tell me, in your own words, what's going on."
  }
}
```

### POST `/api/intake/:id/message`

Send a user turn. The service calls the AI provider, folds the
structured response into the reducer, and persists the next state.
On a parse failure it retries once with a "JSON only" instruction
before flipping the conversation to `FAILED` and returning
`AI_PROVIDER_INVALID_OUTPUT` (502).

```json
// Request
{ "message": "I bought a defective laptop and the store refused a refund." }

// Response 201 — same envelope as /start, with the new state and
// the assistant's reply.
```

Errors: `INTAKE_NOT_FOUND`, `INTAKE_INVALID_STATE`,
`INTAKE_MAX_MESSAGES_EXCEEDED`, `AI_PROVIDER_INVALID_OUTPUT`,
`AI_PROVIDER_UNAVAILABLE`, `AI_RATE_LIMITED`.

### GET `/api/intake/:id`

Rehydrate the conversation envelope. Same shape as the `conversation`
field of `/start` and `/message`.

### POST `/api/intake/:id/confirm`

Finalize the conversation and create the underlying `Case`. Idempotent
— a second confirm with state `CONFIRMED` returns the same `caseId`.

```json
// Response 200
{
  "success": true,
  "data": {
    "caseId": "<uuid>",
    "case": {
      "id": "<uuid>",
      "title": "Defective laptop — refund denied",
      "description": "Bought at the local electronics store on Market Street…",
      "category": "CONSUMER_COMPLAINT",
      "status": "DRAFT",
      "userId": "<uuid>",
      "createdAt": "2026-07-01T12:05:00.000Z",
      "updatedAt": "2026-07-01T12:05:00.000Z"
    }
  }
}
```

Errors: `INTAKE_NOT_FOUND`, `INTAKE_INVALID_STATE`.

### POST `/api/intake/:id/abort`

Mark the conversation as `FAILED`. Use case: the user changes their
mind and wants to start over.

```json
// Request (optional)
{ "reason": "user_aborted" }

// Response 200 — same envelope as GET /:id.
```

## What's NOT in M4

- Streaming responses (M5 swaps the chat layer for SSE).
- Vector DB / RAG / embeddings.
- Voice input, file uploads.
- Multi-user conversations.
- Branching / undo.
