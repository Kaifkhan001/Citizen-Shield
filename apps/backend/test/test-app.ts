// E2E test bootstrap — exposes `app` and `request` for the spec files.
// Run against the live dev Supabase Postgres + local Redis (already running
// in dev). Each suite cleans up the rows it creates.
//
// Test files run in parallel by default. To keep one suite's `beforeEach`
// cleanup from clobbering another suite's freshly-registered users, each
// file scopes its emails to a unique subdomain (e.g. `auth-e2e@test.local`,
// `case-e2e@test.local`) and passes its scope to `clearTestData(scope)`.

import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { env } from '@citizen-shield/config';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { EnvelopeInterceptor } from '../src/common/interceptors/envelope.interceptor';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { PRISMA_CLIENT } from '../src/database/database.module';
import type { PrismaClient } from '@citizen-shield/database';

let app: INestApplication;

export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  // Mirror `main.ts`: mount Swagger outside production so e2e can assert on
  // it. `NODE_ENV` is set to `'test'` by `setup-env.ts`.
  if (env.NODE_ENV !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('Citizen Shield API')
      .setDescription('Authentication and case CRUD endpoints (M3.5).')
      .setVersion('0.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
  await app.init();
  return app;
}

export async function teardownTestApp(): Promise<void> {
  if (app) await app.close();
}

export function getPrisma(): PrismaClient {
  return app.get(PRISMA_CLIENT) as PrismaClient;
}

export function getRedis(): Redis {
  return app.get(REDIS_CLIENT) as Redis;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseDelayMs = 250): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}

/**
 * Delete every row tied to this suite's email scope. Caller passes the
 * subdomain used by the spec file (e.g. `'auth-e2e'` or `'case-e2e'`) so
 * suites can run in parallel without interfering.
 *
 * Order matters: raw DELETE on Case first to bypass the soft-delete
 * extension (which would otherwise turn deleteMany into an updateMany
 * setting deletedAt), then deleteMany on User. FK from
 * Case.userId→User.id is `onDelete: Restrict`.
 */
export async function clearTestData(scope: string): Promise<void> {
  // Defense-in-depth: scope must be a strict subdomain (letters, digits,
  // dash). Prevents SQL injection even though $executeRawUnsafe with a
  // hard-coded `pattern` is the only thing that ever touches user input.
  if (!/^[a-z0-9-]+$/i.test(scope)) {
    throw new Error(`Invalid clearTestData scope: ${scope}`);
  }
  const prisma = getPrisma();
  const redis = getRedis();
  const pattern = `%@${scope}.test.local`;

  await withRetry(() =>
    prisma.$executeRawUnsafe(
      `DELETE FROM "Case" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE '${pattern}')`,
    ),
  );
  await withRetry(() =>
    prisma.user.deleteMany({ where: { email: { contains: `@${scope}.test.local` } } }),
  );

  // Clear all refresh tokens. Refresh tokens are keyed by tokenId, not by
  // user — safest to drop the entire namespace between suites.
  await withRetry(async () => {
    const keys = await redis.keys('auth:refresh:index:*');
    if (keys.length > 0) await redis.del(...keys);
  });
}
