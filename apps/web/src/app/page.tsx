'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { healthResponseSchema, type HealthResponse } from '@citizen-shield/validation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'loading' | 'online' | 'offline';

const HEALTH_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/health`;

export default function Home(): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<HealthResponse | null>(null);
  const { status: authStatus } = useAuth();
  const router = useRouter();

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

  // While AuthProvider is bootstrapping, show a placeholder. Once it
  // resolves, push authed users to the dashboard.
  useEffect(() => {
    if (authStatus === 'authed') {
      router.replace('/dashboard');
    }
  }, [authStatus, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <header>
        <h1 className="text-5xl font-bold tracking-tight">Citizen Shield</h1>
        <p className="mt-2 text-sm text-slate-500">Protection at your fingertips.</p>
      </header>

      <Card className="w-full max-w-md text-left">
        <CardHeader>
          <CardTitle>Get started</CardTitle>
          <CardDescription>
            {authStatus === 'loading' ? 'Checking your session…' : 'Sign in to manage your cases.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/register">Register</Link>
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Backend status" className="rounded-lg border border-slate-200 px-8 py-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Backend</p>
        <p className="mt-1 text-base font-semibold" aria-live="polite">
          {status === 'loading' && 'Checking…'}
          {status === 'online' && 'Online ✅'}
          {status === 'offline' && 'Offline ❌'}
        </p>
        {data && (
          <p className="mt-1 text-xs text-slate-500">
            {data.service}
            {data.timestamp && ` · ${new Date(data.timestamp).toLocaleTimeString()}`}
          </p>
        )}
      </section>
    </main>
  );
}
