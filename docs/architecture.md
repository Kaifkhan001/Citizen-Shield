# Architecture — Milestone 1

## Overview

Citizen Shield is a monorepo containing a Next.js web app and a NestJS API, with shared TypeScript packages for types, validation, configuration, and database access.

## Apps

- **apps/web** — Next.js 15 (App Router) with React 19, TypeScript, and Tailwind. Calls the backend through `NEXT_PUBLIC_API_URL`. Uses Zod schemas from `@citizen-shield/validation` to parse responses.
- **apps/backend** — NestJS 10 with a global API prefix (`/api`). Exposes a `GET /api/health` route. Connects to PostgreSQL via Prisma and to Redis via ioredis.

## Shared packages

- **@citizen-shield/api** — Re-exports shared response types so web and backend agree on shapes.
- **@citizen-shield/auth** — Placeholder; auth implementation lands in M2.
- **@citizen-shield/config** — Loads and validates environment variables with Zod. Throws on startup if invalid.
- **@citizen-shield/database** — Prisma schema and a singleton PrismaClient. The backend registers a Nest provider for DI.
- **@citizen-shield/types** — Brand types and shared enums.
- **@citizen-shield/utils** — Generic helpers (date formatting, null checks).
- **@citizen-shield/validation** — Zod schemas for request/response shapes.
- **@citizen-shield/ai** — Placeholder; AI provider integrations land later.

## Tooling

- **Turborepo** orchestrates tasks across the workspace. `pnpm dev` runs `dev` in parallel across all apps.
- **TypeScript** is used everywhere with strict mode enabled. A base `tsconfig.base.json` is extended by each package.
- **ESLint** + **Prettier** enforce style. The web app uses `next lint`; packages use a flat config.
- **Husky** + **lint-staged** format and lint staged files on commit.

## Runtime

- **PostgreSQL** is the system of record. The schema lives in `packages/database/prisma/schema.prisma`. No models yet — they land alongside the first feature.
- **Redis** is available for future queues and caching. The backend injects a `REDIS_CLIENT` provider. No queues or cache logic in M1.

## Decisions

- **API prefix**: NestJS mounts routes under `/api` so the web app can call `NEXT_PUBLIC_API_URL` directly without proxying.
- **No `dist` builds for packages**: TypeScript source is consumed directly via `transpilePackages` in Next and `@nestjs/cli` in the backend. This keeps dev fast; production builds still compile.
- **CORS**: enabled in dev with permissive origin; the production posture will be locked down once the web origin is known.
