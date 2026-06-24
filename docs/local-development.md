# Local development

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose

## First-time setup

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:generate
pnpm dev
```

## Ports

| Service     | Port | URL                                  |
| ----------- | ---- | ------------------------------------ |
| Web (Next)  | 3000 | http://localhost:3000                |
| API (Nest)  | 3001 | http://localhost:3001                |
| API prefix  | —    | `/api`                               |
| Health      | —    | http://localhost:3001/api/health     |
| Postgres    | 5432 | postgresql://localhost:5432          |
| Redis       | 6379 | redis://localhost:6379               |

## Useful commands

```bash
# Stop infrastructure
docker compose down

# Reset database
docker compose down -v
pnpm db:generate

# Lint everything
pnpm lint

# Format everything
pnpm format
```
