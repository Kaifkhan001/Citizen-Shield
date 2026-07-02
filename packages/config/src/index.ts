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

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL must be a valid URL'),

    BACKEND_PORT: z.coerce.number().int().positive().default(3001),
    WEB_PORT: z.coerce.number().int().positive().default(3000),

    // M3 additions
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Comma-separated list of allowed origins for CORS. Used by the backend's
    // express CORS config. Empty in production means "use NEXT_PUBLIC_API_URL's
    // origin" — but in dev we default to localhost:3000.
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),

    // M3.5 — rate limiting. `RATE_LIMIT_TTL` is the window in milliseconds;
    // `RATE_LIMIT_LIMIT` is the number of requests allowed per window per IP.
    // `AUTH_RATE_LIMIT_*` is the stricter per-route cap applied to `/auth/*`.
    // Tests bump these so a single suite can issue hundreds of requests.
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60_000),
    AUTH_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(5),

    // M4 — AI intake. `AI_PROVIDER` selects the concrete provider at boot.
    // Default `mock` keeps dev/test free of network and API-key requirements;
    // set to `openai` (and supply `OPENAI_API_KEY`) for live behavior.
    // `INTAKE_MAX_MESSAGES` is the hard ceiling on user messages per
    // conversation; once exceeded the service throws INTAKE_MAX_MESSAGES_EXCEEDED.
    AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    AI_MODEL: z.string().min(1).default('gpt-4o-mini'),
    AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
    OPENAI_API_KEY: z.string().optional(),
    AI_RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60_000),
    AI_RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(20),
    INTAKE_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
  })
  .superRefine((data, ctx) => {
    // Cross-field rule: openai provider must have an API key. We refuse to
    // boot otherwise so a missing key fails loud, not at first request.
    if (data.AI_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables. See errors above.');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
