'use client';

import { useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@citizen-shield/validation';

type Status = 'loading' | 'online' | 'offline';

const HEALTH_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/health`;

export default function Home(): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function check(): Promise<void> {
      try {
        const res = await fetch(HEALTH_ENDPOINT, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`Backend responded with ${res.status}`);
        }

        const json: unknown = await res.json();
        const parsed = healthResponseSchema.parse(json);
        setData(parsed);
        setStatus('online');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setStatus('offline');
        }
      }
    }

    void check();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <header>
        <h1 className="text-5xl font-bold tracking-tight">Citizen Shield</h1>
        <p className="mt-2 text-sm text-gray-500">Project foundation — Milestone 1</p>
      </header>

      <section
        aria-label="Backend status"
        className="rounded-lg border border-gray-200 px-8 py-6 dark:border-gray-800"
      >
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Backend status
        </h2>
        <p className="text-2xl font-semibold" aria-live="polite">
          {status === 'loading' && 'Checking…'}
          {status === 'online' && 'Backend Online ✅'}
          {status === 'offline' && 'Backend Offline ❌'}
        </p>
        {data && (
          <p className="mt-2 text-xs text-gray-500">
            {data.service}
            {data.timestamp && ` · ${new Date(data.timestamp).toLocaleTimeString()}`}
          </p>
        )}
      </section>
    </main>
  );
}
