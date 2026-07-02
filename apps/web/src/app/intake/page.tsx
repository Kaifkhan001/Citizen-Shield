'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@citizen-shield/api';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Landing page for the AI intake flow. Kicks off a new conversation
 * (with an optional initial message) and redirects to the chat
 * surface at `/intake/[id]`.
 */
export default function IntakeLandingPage(): React.ReactElement {
  const { status } = useAuth();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  async function start(): Promise<void> {
    setStarting(true);
    setError(null);
    // Call the backend with no body — the controller's Zod pipe
    // accepts an empty object.
    const res = await api<{ id: string }>(ENDPOINTS.intake.start, {
      method: 'POST',
      body: {},
    });
    setStarting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    // The detail shape is `IntakeMessageResponse { conversation, assistantMessage }`,
    // so we use the conversation id to navigate.
    const detail = res.data as unknown as {
      conversation: { id: string };
    };
    router.push(ENDPOINTS.intake.detail(detail.conversation.id));
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
          <CardTitle>Let&apos;s start your case</CardTitle>
          <CardDescription>
            Our AI assistant will ask a few questions to understand your situation, then put
            together a draft you can review before anything is filed.
          </CardDescription>
        </CardHeader>
        <CardContent>{error && <p className="text-sm text-red-600">{error}</p>}</CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={() => void start()} disabled={starting}>
            {starting ? 'Starting…' : 'Start intake'}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
