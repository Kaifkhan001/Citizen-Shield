// Soft-delete Prisma client extension.
//
// Models with a `deletedAt` column (Case, Evidence, Complaint per the schema)
// are filtered out of reads and made invisible to updates/deletes by default.
// The extension is the only place in the codebase that knows about
// `deletedAt` — services and controllers just use `findFirst`, `findMany`,
// `update`, `delete` as if every soft-deletable row were a hard-deletable
// row, and the extension quietly filters.
//
// To permanently delete a row (an admin action that we don't expose yet), use
// `client.$bypassSoftDelete.case.delete(...)` — that delegates to a raw
// PrismaClient without the extension applied.

import type { PrismaClient } from '@citizen-shield/database';

const SOFT_DELETE_MODELS = new Set(['Case', 'Evidence', 'Complaint']);

function withDeletedAtFilter(where: unknown): unknown {
  if (!where || typeof where !== 'object') return where;
  const w = where as Record<string, unknown>;
  if ('deletedAt' in w) return w; // caller already specified — respect it
  return { ...w, deletedAt: null };
}

function injectSoftDeleteFilters<T>(args: T | undefined): T | undefined {
  if (!args) return args;
  const a = args as Record<string, unknown>;
  return { ...a, where: withDeletedAtFilter(a.where) } as T;
}

function lowerFirst(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// Prisma's $extends query callback types are deeply conditional on the
// `model` discriminant; declaring them inline is impractical. We type them
// locally as `unknown` and validate at the boundary.
interface ModelQueryArgs {
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (a: any) => Promise<unknown>;
}

export function withSoftDelete(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async findUnique({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            return query({ ...args, where: withDeletedAtFilter(args.where) });
          }
          return query(args);
        },
        async findFirst({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            return query(injectSoftDeleteFilters(args));
          }
          return query(args);
        },
        async findMany({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            return query(injectSoftDeleteFilters(args));
          }
          return query(args);
        },
        async count({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            return query(injectSoftDeleteFilters(args));
          }
          return query(args);
        },
        async update({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const delegate = client[lowerFirst(model) as keyof PrismaClient] as unknown as {
              findFirst: (a: unknown) => Promise<unknown>;
            };
            const existing = await delegate.findFirst({ where: withDeletedAtFilter(args.where) });
            if (!existing) {
              throw new SoftDeletedNotFoundError(model);
            }
            return query(args);
          }
          return query(args);
        },
        async updateMany({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            return query(injectSoftDeleteFilters(args));
          }
          return query(args);
        },
        async delete({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const delegate = client[lowerFirst(model) as keyof PrismaClient] as unknown as {
              findFirst: (a: unknown) => Promise<{ id: string } | null>;
              update: (a: unknown) => Promise<unknown>;
            };
            const existing = await delegate.findFirst({ where: withDeletedAtFilter(args.where) });
            if (!existing) {
              throw new SoftDeletedNotFoundError(model);
            }
            return delegate.update({
              where: { id: existing.id },
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }: ModelQueryArgs) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const delegate = client[lowerFirst(model) as keyof PrismaClient] as unknown as {
              updateMany: (a: unknown) => Promise<unknown>;
            };
            const a = (args ?? {}) as Record<string, unknown>;
            return delegate.updateMany({
              ...(a.where ? { where: withDeletedAtFilter(a.where) } : {}),
              data: { ...(a.data ?? {}), deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  // Expose `$bypassSoftDelete` on the wrapped client so admin code (or tests)
  // can hit the underlying PrismaClient without the extension intercepting.
  // The bypass is a simple property assignment — Prisma clients are plain
  // objects, so this is safe.
  (extended as unknown as { $bypassSoftDelete: PrismaClient }).$bypassSoftDelete = client;
  return extended;
}

export class SoftDeletedNotFoundError extends Error {
  constructor(public readonly model: string) {
    super(`Soft-deleted ${model} not found`);
    this.name = 'SoftDeletedNotFoundError';
  }
}
