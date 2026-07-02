'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { useAuth } from '@/hooks/use-auth';
import { type ConversationResponse, type IntakeMessageResponse } from '@citizen-shield/validation';
import { IntakeChat } from '@/components/intake/intake-chat';

/**
 * Chat surface for a single intake conversation. Fetches the
 * envelope on mount and hands it to the `<IntakeChat>` orchestrator.
 * If the conversation can't be loaded (404, 401, etc.) we bounce
 * back to the landing page.
 */
export default function IntakeDetailPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [conversation, setConversation] = useState<ConversationResponse | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string>('');
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
      // The very first assistant message is the greeting; fall back
      // to the latest assistant message if messages[0] is missing.
      const firstAssistant = res.data.messages.find((m) => m.role === 'assistant');
      setAssistantMessage(firstAssistant?.content ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [id, status]);

  if (status !== 'authed' || (!conversation && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading conversation…
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
    <IntakeChat initialConversation={conversation} initialAssistantMessage={assistantMessage} />
  );
}

// Suppress an unused-import warning for `IntakeMessageResponse`; kept
// exported above for the next iteration that may need to call
// /:id/message directly from the page.
void (null as unknown as IntakeMessageResponse);
