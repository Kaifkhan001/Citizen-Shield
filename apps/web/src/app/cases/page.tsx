'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import type { CaseListResponse, CaseResponse } from '@citizen-shield/validation';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CasesPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<CaseResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/login');
      return;
    }
    if (status !== 'authed') return;

    let cancelled = false;
    void (async () => {
      const res = await api<CaseListResponse>(ENDPOINTS.cases.list);
      if (cancelled) return;
      if (res.ok) setCases(res.data ?? []);
      else toast.error(res.error.message);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  if (status !== 'authed') {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
          <p className="text-sm text-slate-500">All your tracked cases.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/cases/new">New case</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : cases.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No cases yet</CardTitle>
            <CardDescription>Create your first case to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/cases/new">Create a case</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={ENDPOINTS.cases.detail(c.id)}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p>
                    <p className="mt-2 text-xs text-slate-400">{c.category}</p>
                  </div>
                  <span className="ml-4 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {c.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
