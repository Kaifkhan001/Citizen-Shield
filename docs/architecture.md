# Architecture

## Overview

Citizen Shield is a TypeScript monorepo with a NestJS API and a Next.js web app,
sharing Zod schemas, error codes, and types across both ends. The platform is
intentionally minimal — authentication, case CRUD, and a hardened engineering
shell — with AI, evidence uploads, complaint generation, and the rest deferred
to later milestones.

## Apps

- **apps/web** — Next.js 15 (App Router) with React 19, Tailwind, and
  hand-scaffolded shadcn-style primitives. Auth state lives in a React Context
  hydrated from `/api/auth/refresh` on app boot.
- **apps/backend** — NestJS 10 with a global `/api` prefix. A single
  `HttpExceptionFilter` and `EnvelopeInterceptor` shape every response so the
  wire contract is uniform. Swagger UI is mounted at `/api/docs` outside
  production.

## Shared packages

- **@citizen-shield/api** — Endpoint constants + envelope types
  (`ApiSuccess<T>`, `ApiFailure`). Re-exports `@citizen-shield/errors` for
  convenience.
- **@citizen-shield/auth** — JWT sign/verify via `jose`, argon2id password
  hashing, refresh-token cookie builders, and the canonical token TTL
  constants (`ACCESS_TOKEN_TTL_SECONDS = 900`,
  `REFRESH_TOKEN_TTL_SECONDS = 604800`).
- **@citizen-shield/config** — Zod-validated env loader. The backend refuses
  to boot if a required variable is missing or unparseable. The schema is the
  documented contract.
- **@citizen-shield/database** — Prisma schema + client. Adds a soft-delete
  client extension that injects `where: { deletedAt: null }` on every model
  that has the field. The only place that knows about soft-delete.
- **@citizen-shield/errors** — Single source of truth for error codes
  (`ErrorCode` const + type, `ErrorStatus` HTTP map, `ErrorMessage` defaults,
  `ApiError` class, Zod envelope schemas). The global filter, the frontend
  result wrapper, and every `throw` site all derive from here.
- **@citizen-shield/logger** — `pino` + `nestjs-pino`. Mints or honors an
  inbound `X-Request-ID` header and stamps every log line with request id,
  method, route, user id. Redacts `authorization`, `cookie`, `set-cookie`.
- **@citizen-shield/types** — Brand types and shared enums (CaseCategory,
  CaseStatus, UserRole, etc.).
- **@citizen-shield/utils** — Generic helpers (date formatting, null checks).
- **@citizen-shield/validation** — Zod schemas for request/response shapes.
  The same schema is used to validate inputs on the server and to type API
  calls on the client.

## Backend layering

```
Controller          (thin: parse, authorize, delegate, return)
  ↓
Service             (business logic, ownership checks, transactions)
  ↓
PrismaClient        (extended with soft-delete; no service bypasses it)
```

- **Validation** is per-route via `@Body(new ZodValidationPipe(schema))` /
  `@Param('id', new ZodParamPipe(uuidSchema))`. No global `ValidationPipe`
  because each handler has its own schema.
- **Auth** flows: `JwtAuthGuard` (Bearer → `req.user`), optional
  `RolesGuard`, ownership filter inside the service.
- **Errors** flow: throw an `HttpException` (or anything) → filter wraps in
  `{ success: false, error: { code, message, requestId? } }`.

## Runtime

- **PostgreSQL** is the system of record. Schema in
  `packages/database/prisma/schema.prisma`. Soft-delete is implemented as a
  `DateTime? deletedAt` column + a client extension.
- **Redis** stores refresh tokens under
  `auth:refresh:index:<tokenId>` with a 7-day TTL. Rotation atomically
  deletes the old key and mints a new pair.

## Decisions

- **API prefix**: NestJS mounts routes under `/api`; Swagger UI is mounted
  at `/api/docs` (dev-only).
- **No `dist` builds for packages**: TypeScript source is consumed directly
  via `transpilePackages` in Next and `@nestjs/cli` in the backend. Production
  builds still compile the apps.
- **CORS**: allowlist driven by `WEB_ORIGINS` env (comma-separated).
  `credentials: true` so the refresh cookie travels.
- **Refresh token transport**: HttpOnly + `SameSite=Lax` cookie. `Secure`
  outside dev. JWT access tokens travel in `Authorization: Bearer …`.
- **Rate limiting**: `@nestjs/throttler` driven by `RATE_LIMIT_TTL` and
  `RATE_LIMIT_LIMIT` env vars (see `packages/config`). Auth routes get a
  stricter decorator-based limit; tests raise the limit so a single suite can
  issue hundreds of auth requests.
- **Correlation IDs**: every response carries an `X-Request-ID` header;
  every error envelope includes `error.requestId`. Logs are tagged with the
  same id.

## M4 — AI intake conversation

The intake feature replaces the "type your case into a form" UX with a
multi-turn dialogue driven by a state machine. No agent framework,
no streaming, no vector DB.

```
┌────────────┐    POST /start     ┌────────────────────┐
│ /intake UI │ ─────────────────▶ │ IntakeService      │
└────────────┘                    │  (backend)         │
       ▲                          └──────────┬─────────┘
       │                                     │ chat(req)
       │                          ┌──────────▼─────────┐
       │                          │ AIProvider         │
       │                          │  ├ MockProvider    │
       │                          │  └ OpenAIProvider  │
       │                          └──────────┬─────────┘
       │                                     │ AiTurnResponse
       │                          ┌──────────▼─────────┐
       │                          │ transition()       │
       │                          │  (pure reducer)    │
       │                          └──────────┬─────────┘
       │                                     │
       │  GET /:id  ┌────────────┐           │
       └────────────│ Conversation│◀──────────┘
                    │  (Postgres) │
                    └────────────┘
```

State machine (see `packages/ai/src/state.ts`):

```
   started
      ▼
   gathering_problem  ──(detectedCategory)──▶  gathering_category
                                                    │
                                                    ▼
                                              gathering_facts
                                                    │
                              (isReadyToConfirm+facts)│
                                                    ▼
                                          gathering_followups
                                                    │
                              (questions drained)    │
                                                    ▼
                                          ready_to_confirm
                                                    │ POST /:id/confirm
                                                    ▼
                                              confirmed
```

- Any state ─(AI bad output twice)─▶ failed.
- `confirmed` and `failed` are terminal: further `transition()` calls
  return `invalid: true`; the service maps that to `INTAKE_INVALID_STATE`.
- The `Conversation` row is created on `/start`. The `Case` row is
  **only** created on `POST /:id/confirm`, in a transaction that also
  writes the `CaseTimeline` event and flips the conversation to
  `CONFIRMED`.

Providers are selected at boot via `AI_PROVIDER` (`mock` default,
`openai` requires `OPENAI_API_KEY`). The wire contract — the
`aiTurnResponseSchema` in `packages/ai/src/schemas.ts` — is the same
for both. `safeParseAiResponse` classifies parse failures as
`malformed_json` vs `schema_mismatch`; the service retries once with
a "reply with JSON only" instruction before flipping the conversation
to `failed` and returning 502.
