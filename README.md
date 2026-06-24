# Citizen Shield

Production-grade monorepo foundation.

## Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: NestJS 10, TypeScript
- **Database**: PostgreSQL + Prisma
- **Cache**: Redis
- **Validation**: Zod

## Structure

```
citizen-shield/
├── apps/
│   ├── web/        # Next.js frontend
│   └── backend/    # NestJS API
├── packages/
│   ├── api/        # API client + response shapes
│   ├── auth/       # Auth primitives (stub for M2)
│   ├── config/     # Validated env config
│   ├── database/   # Prisma client + schema
│   ├── types/      # Cross-cutting TypeScript types
│   ├── utils/      # Generic helpers
│   ├── validation/ # Zod schemas
│   └── ai/         # AI provider integrations (stub for later)
└── docs/
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
```

### 4. Generate Prisma client

```bash
pnpm db:generate
```

### 5. Start dev servers

```bash
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api>
- Health: <http://localhost:3001/api/health>

## Scripts

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `pnpm dev`         | Run all apps in dev mode (Turbo)      |
| `pnpm build`       | Build all apps and packages           |
| `pnpm lint`        | Lint all workspaces                   |
| `pnpm format`      | Format with Prettier                  |
| `pnpm db:generate` | Generate Prisma client                |
| `pnpm db:migrate`  | Run Prisma migrations (M2+)           |
| `pnpm db:studio`   | Open Prisma Studio                    |

## Milestone 1 — Foundation

This milestone ships the foundation only:

- ✅ Monorepo with Turborepo + pnpm
- ✅ Next.js frontend
- ✅ NestJS backend with `/api/health`
- ✅ Prisma wired to PostgreSQL
- ✅ Redis client configured
- ✅ Docker Compose for Postgres + Redis
- ✅ Tooling: ESLint, Prettier, Husky, lint-staged
- ❌ No business logic, no auth, no models, no AI

See `docs/` for architectural notes.
