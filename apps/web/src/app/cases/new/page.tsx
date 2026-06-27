'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CaseCategory } from '@citizen-shield/types';
import {
  type CaseResponse,
  type CreateCaseInput,
  createCaseSchema,
} from '@citizen-shield/validation';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const CATEGORY_OPTIONS: { value: `${CaseCategory}`; label: string }[] = [
  { value: 'CONSUMER_COMPLAINT', label: 'Consumer complaint' },
  { value: 'EMPLOYMENT_DISPUTE', label: 'Employment dispute' },
];

export default function NewCasePage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateCaseInput>({ resolver: zodResolver(createCaseSchema) });

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  async function onSubmit(values: CreateCaseInput): Promise<void> {
    setSubmitting(true);
    setError(null);
    const res = await api<CaseResponse>(ENDPOINTS.cases.create, {
      method: 'POST',
      body: values,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.success('Case created');
    router.push(ENDPOINTS.cases.detail(res.data.id));
  }

  if (status !== 'authed') {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>New case</CardTitle>
          <CardDescription>Describe your issue. You can edit details later.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Refund denied for defective product"
                {...register('title')}
              />
              {errors.title && <p className="text-xs text-red-600">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={6}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                placeholder="What happened? When? Who is involved?"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-red-600">{errors.description.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                defaultValue=""
                {...register('category')}
              >
                <option value="" disabled>
                  Select a category…
                </option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-600">{errors.category.message}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create case'}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Cancel</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
