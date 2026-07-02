# Citizen Shield

Production-grade monorepo foundation.

## Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn-style primitives
- **Backend**: NestJS 10 with a global API prefix (`/api`)
- **Database**: PostgreSQL via Prisma 6 (with a soft-delete client extension)
- **Cache**: Redis (refresh token storage)
- **Validation**: Zod 3 (one schema, shared by request parsing and frontend types)
- **Logging**: Pino (pretty in dev, JSON in prod) + `nestjs-pino` request middleware
- **Errors**: centralized registry in `@citizen-shield/errors` (single source of truth)
- **Auth**: JWT (HS256, `jose`) access tokens + opaque refresh tokens in Redis, with rotation

## Structure

```
citizen-shield/
├── apps/
│   ├── web/        # Next.js frontend
│   └── backend/    # NestJS API
├── packages/
│   ├── api/        # API client + envelope types + endpoint constants
│   ├── auth/       # JWT/argon2 primitives + refresh cookie helpers
│   ├── config/     # Zod-validated env config
│   ├── database/   # Prisma client + schema + soft-delete extension
│   ├── errors/     # ErrorCode registry, status map, envelope Zod schemas
│   ├── logger/     # Pino + nestjs-pino setup, X-Request-ID propagation
│   ├── types/      # Cross-cutting TypeScript types
│   ├── utils/      # Generic helpers
│   └── validation/ # Zod schemas for request/response shapes
└── docs/
    ├── api.md            # HTTP API reference
    ├── architecture.md   # High-level architecture
    ├── authentication.md # Token flow, refresh rotation, security posture
    ├── database-schema.md
    └── local-development.md
```

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — see packages/config/src/index.ts for the full schema.
```

### 4. Generate Prisma client + run migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start dev servers

```bash
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api>
- Health: <http://localhost:3001/api/health>
- Swagger UI (dev only): <http://localhost:3001/api/docs>

## Scripts

| Command            | What it does                            |
| ------------------ | --------------------------------------- |
| `pnpm dev`         | Run all apps in dev mode (Turbo)        |
| `pnpm build`       | Build all apps and packages             |
| `pnpm lint`        | Lint all workspaces                     |
| `pnpm format`      | Format with Prettier                    |
| `pnpm type-check`  | Run `tsc --noEmit` across the workspace |
| `pnpm test`        | Run all unit + e2e tests                |
| `pnpm db:generate` | Generate Prisma client                  |
| `pnpm db:migrate`  | Run Prisma migrations                   |
| `pnpm db:seed`     | Seed the dev database                   |
| `pnpm db:studio`   | Open Prisma Studio                      |

## Milestone status

- **M1 — Foundation** ✅ monorepo, Next.js, NestJS `/api/health`, Prisma + Redis, tooling
- **M2 — Core domain** ✅ six Prisma models, enums, soft-delete, domain module skeletons
- **M3 — Auth & case CRUD** ✅ register/login/refresh/logout/me, case CRUD, ownership filter, RBAC hook
- **M3.5 — Platform hardening** ✅
  - OpenAPI / Swagger UI at `/api/docs` (dev-only)
  - Centralized `@citizen-shield/errors` registry consumed by the global filter
  - Prisma `P2002` / `P2025` → typed error codes
  - X-Request-ID propagation end-to-end (logs + error envelope)
  - UUID validation on route params (400 `VALIDATION_ERROR`)
  - Env-driven rate limiting
  - Backward-compatible envelope with `requestId` and optional `details`
  - Test suite (25 e2e tests across auth, cases, and UUID validation)
- **M4 — AI intake conversation** ✅
  - Pure-TypeScript state machine in `packages/ai` (no LangChain / agent framework)
  - `AIProvider` interface with `MockProvider` (default) and `OpenAIProvider`
  - Five `/api/intake/*` routes (`/start`, `/:id/message`, `/:id`, `/:id/confirm`, `/:id/abort`)
  - `Conversation` row created on `/start`; `Case` only created on `/confirm`
  - Zod-validated `aiTurnResponseSchema`; one retry on parse failure
  - Frontend chat at `/intake` and `/intake/[id]` (bubbles, typing indicator, optimistic append)
  - Confirm form at `/intake/[id]/confirm` with title/description/category edits

## Out of scope (deferred)

Streaming chat (M5), evidence uploads, complaint generation, timelines, notifications, search,
pagination, filtering, RAG, lawyer features, consumer-specific workflows, employment-specific
workflows, voice input, file uploads.

See `docs/` for the full design.
