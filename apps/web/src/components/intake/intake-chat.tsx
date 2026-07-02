'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { type ConversationResponse, type IntakeMessageResponse } from '@citizen-shield/validation';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { Button } from '@/components/ui/button';
import { ChatBubble } from './chat-bubble';
import { ChatComposer } from './chat-composer';
import { TypingIndicator } from './typing-indicator';

interface IntakeChatProps {
  initialConversation: ConversationResponse;
  initialAssistantMessage: string;
}

/**
 * Orchestrator for the AI intake chat. Owns the conversation state
 * (messages, current `IntakeState`), handles optimistic appends, and
 * surfaces the "Review your case" CTA once the conversation reaches
 * `ready_to_confirm`.
 *
 * The component is intentionally streaming-ready: the `isThinking`
 * flag can be flipped to a real Server-Sent-Events connection in M5
 * without changing the component contract.
 */
export function IntakeChat({
  initialConversation,
  initialAssistantMessage,
}: IntakeChatProps): React.ReactElement {
  const router = useRouter();
  const [conversation, setConversation] = useState<ConversationResponse>(initialConversation);
  // The greeting is part of `conversation.messages[0]`, but we also
  // surface it as the first assistant bubble so the user has something
  // to read while they orient themselves.
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new message. We scroll into view of the *bottom*
  // container rather than a sentinel, so any height of bubble stays
  // in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.messages.length, optimisticUserMessage, isThinking]);

  async function sendMessage(message: string): Promise<void> {
    setError(null);
    setOptimisticUserMessage(message);
    setIsThinking(true);
    const res = await api<IntakeMessageResponse>(ENDPOINTS.intake.message(conversation.id), {
      method: 'POST',
      body: { message },
    });
    setIsThinking(false);
    setOptimisticUserMessage(null);
    if (!res.ok) {
      setError(res.error.message);
      toast.error(res.error.message);
      return;
    }
    setConversation(res.data.conversation);
  }

  async function abort(): Promise<void> {
    const res = await api<ConversationResponse>(ENDPOINTS.intake.abort(conversation.id), {
      method: 'POST',
      body: { reason: 'user_aborted' },
    });
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setConversation(res.data);
    toast.success('Conversation closed.');
    router.push('/dashboard');
  }

  const state = conversation.state;
  const isTerminal = state.kind === 'confirmed' || state.kind === 'failed';
  const canSend =
    !isThinking &&
    !isTerminal &&
    (state.kind === 'gathering_problem' ||
      state.kind === 'gathering_category' ||
      state.kind === 'gathering_facts' ||
      state.kind === 'gathering_followups');

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900">Citizen Shield Intake</h1>
            <p className="text-xs text-slate-500">
              Tell us about your case. We&apos;ll guide you through a few questions before filing.
            </p>
          </div>
          {state.kind === 'ready_to_confirm' && (
            <Button asChild>
              <Link href={ENDPOINTS.intake.confirm(conversation.id)}>Review case →</Link>
            </Button>
          )}
          {!isTerminal && state.kind !== 'ready_to_confirm' && (
            <Button variant="ghost" onClick={() => void abort()}>
              Cancel
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
          {/* Greeting. The backend always writes it as messages[0]; we
              re-render it explicitly so the user has a clear "the
              assistant started" anchor. */}
          <ChatBubble role="assistant">{initialAssistantMessage}</ChatBubble>

          {conversation.messages.slice(1).map((m) => (
            <ChatBubble key={`${m.role}-${m.ts}`} role={m.role}>
              {m.content}
            </ChatBubble>
          ))}

          {optimisticUserMessage && <ChatBubble role="user">{optimisticUserMessage}</ChatBubble>}

          {isThinking && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}

          {state.kind === 'ready_to_confirm' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              I have enough to put your case together. Tap <strong>Review case</strong> above to
              confirm.
            </div>
          )}

          {state.kind === 'failed' && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              This conversation couldn&apos;t continue. You can start a new one from the dashboard.
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">
              {error}
            </div>
          )}
        </div>
      </div>

      <ChatComposer onSend={sendMessage} disabled={!canSend} />
    </div>
  );
}
