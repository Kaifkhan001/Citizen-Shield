import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// `__dirname` is provided by the runtime (CJS) or Node's TS stripper. We declare
// it locally to keep this file compile-clean across module systems.
declare const __dirname: string;

// Walk up the directory tree from `start` looking for a `.env` file. Stops at
// the filesystem root or after `maxDepth` hops. This lets a single .env at the
// monorepo root serve both apps without copying, regardless of CWD.
function findEnvUp(start: string, maxDepth = 6): string | null {
  let dir = resolve(start);
  for (let i = 0; i < maxDepth; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
}

function loadEnv(): void {
  const moduleDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const envPath =
    findEnvUp(process.cwd()) ??
    findEnvUp(moduleDir) ??
    findEnvUp(resolve(moduleDir, '..', '..', '..', '..', '..'));
  if (envPath) {
    loadDotenv({ path: envPath });
    return;
  }
  // Fallback: dotenv will look for .env in cwd by default.
  loadDotenv();
}

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL must be a valid URL'),

  BACKEND_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables. See errors above.');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
