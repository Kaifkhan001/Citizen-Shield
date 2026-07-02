'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { useAuth } from '@/hooks/use-auth';
import { type ConversationResponse } from '@citizen-shield/validation';
import { IntakeConfirmForm } from '@/components/intake/intake-confirm-form';

/**
 * Confirm screen for an intake conversation. Re-fetches the
 * envelope (so we always show the freshest draft) and hands it to
 * the form. If the conversation isn't in `ready_to_confirm`, the
 * form shows an empty-state instead of submitting.
 */
export default function IntakeConfirmPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [conversation, setConversation] = useState<ConversationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (!id || status !== 'authed') return;
    let cancelled = false;
    void (async () => {
      const res = await api<ConversationResponse>(ENDPOINTS.intake.detail(id));
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setConversation(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, status]);

  if (status !== 'authed' || (!conversation && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </main>
    );
  }

  if (error || !conversation) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-red-600">{error ?? 'Conversation not found.'}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <IntakeConfirmForm conversation={conversation} />
    </main>
  );
}
