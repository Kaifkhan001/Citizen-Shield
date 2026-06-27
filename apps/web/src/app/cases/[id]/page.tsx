'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  type CaseResponse,
  type UpdateCaseInput,
  updateCaseSchema,
} from '@citizen-shield/validation';
import { CaseStatus, CaseCategory } from '@citizen-shield/types';
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

const STATUS_OPTIONS: { value: `${CaseStatus}`; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EVIDENCE_PENDING', label: 'Evidence pending' },
  { value: 'READY_TO_FILE', label: 'Ready to file' },
  { value: 'FILED', label: 'Filed' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting response' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const CATEGORY_OPTIONS: { value: `${CaseCategory}`; label: string }[] = [
  { value: 'CONSUMER_COMPLAINT', label: 'Consumer complaint' },
  { value: 'EMPLOYMENT_DISPUTE', label: 'Employment dispute' },
];

export default function CaseDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { status } = useAuth();
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateCaseInput>({ resolver: zodResolver(updateCaseSchema) });

  useEffect(() => {
    if (status === 'guest') {
      router.replace('/login');
      return;
    }
    if (status !== 'authed') return;

    let cancelled = false;
    void (async () => {
      const res = await api<CaseResponse>(ENDPOINTS.cases.detail(id));
      if (cancelled) return;
      if (res.ok) {
        setCaseData(res.data);
        reset({
          title: res.data.title,
          description: res.data.description,
          category: res.data.category,
          status: res.data.status,
        });
      } else {
        setError(res.error.message);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, id, router, reset]);

  async function onSubmit(values: UpdateCaseInput): Promise<void> {
    setSaving(true);
    const res = await api<CaseResponse>(ENDPOINTS.cases.update(id), {
      method: 'PATCH',
      body: values,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setCaseData(res.data);
    toast.success('Case updated');
  }

  async function onDelete(): Promise<void> {
    if (!confirm('Delete this case? This cannot be undone.')) return;
    setDeleting(true);
    const res = await api<{ id: string; deleted: true }>(ENDPOINTS.cases.remove(id), {
      method: 'DELETE',
    });
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success('Case deleted');
    router.push('/dashboard');
  }

  if (status !== 'authed' || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  if (error || !caseData) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Case not found'}</AlertDescription>
        </Alert>
        <p className="mt-4 text-sm">
          <Link href="/dashboard" className="underline">
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Edit case</CardTitle>
          <CardDescription>
            Last updated {new Date(caseData.updatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register('title')} />
              {errors.title && <p className="text-xs text-red-600">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={6}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-red-600">{errors.description.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  {...register('category')}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  {...register('status')}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Cancel</Link>
              </Button>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete case'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
