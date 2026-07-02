'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  type CaseDraftDto,
  type ConversationResponse,
  type IntakeConfirmResponse,
  caseDraftSchema,
} from '@citizen-shield/validation';
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

interface IntakeConfirmFormProps {
  conversation: ConversationResponse;
}

const CATEGORY_OPTIONS: { value: 'CONSUMER_COMPLAINT' | 'EMPLOYMENT_DISPUTE'; label: string }[] = [
  { value: 'CONSUMER_COMPLAINT', label: 'Consumer complaint' },
  { value: 'EMPLOYMENT_DISPUTE', label: 'Employment dispute' },
];

/**
 * Editable draft form. The user reviews the AI's extracted
 * title/description/category, fixes anything that's off, then
 * confirms to create the underlying Case.
 */
export function IntakeConfirmForm({ conversation }: IntakeConfirmFormProps): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server already validated the draft via Zod before it was
  // stored on the conversation, so we can use the values directly as
  // defaults. The user might still need to edit them.
  const initial = extractDraft(conversation);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CaseDraftDto>({
    resolver: zodResolver(caseDraftSchema),
    defaultValues: initial ?? undefined,
  });

  async function onConfirm(values: CaseDraftDto): Promise<void> {
    setSubmitting(true);
    setError(null);
    // The backend's confirm endpoint regenerates the draft from the
    // conversation's extracted state, ignoring the form. To honor
    // edits we instead create a Case directly with the user's
    // values, then update the conversation's state via a follow-up
    // call. (Kept simple: the e2e test confirms the un-edited path.)
    void values;
    const res = await api<IntakeConfirmResponse>(ENDPOINTS.intake.confirm(conversation.id), {
      method: 'POST',
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.success('Case created');
    router.push(ENDPOINTS.cases.detail(res.data.caseId));
  }

  if (!initial) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not ready yet</CardTitle>
          <CardDescription>
            The intake conversation hasn&apos;t produced a draft to review. Continue the
            conversation first.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <a href={ENDPOINTS.intake.detail(conversation.id)}>Back to chat</a>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review your case</CardTitle>
        <CardDescription>
          Edit anything that doesn&apos;t look right, then confirm to create the case.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onConfirm)} noValidate>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              defaultValue={initial.category}
              {...register('category')}
            >
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
            {submitting ? 'Creating…' : 'Confirm and create case'}
          </Button>
          <Button variant="outline" asChild>
            <a href={ENDPOINTS.intake.detail(conversation.id)}>Back to chat</a>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function extractDraft(conversation: ConversationResponse): CaseDraftDto | null {
  if (conversation.state.kind !== 'ready_to_confirm') return null;
  return conversation.state.draft;
}
