import { cn } from '@/lib/cn';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  children: React.ReactNode;
}

/**
 * Single message bubble. Assistant messages are left-aligned with a
 * light background; user messages are right-aligned with a dark
 * background. Whitespace-pre-wrap preserves the line breaks the
 * assistant's JSON / markdown payload might contain.
 */
export function ChatBubble({ role, children }: ChatBubbleProps): React.ReactElement {
  const isUser = role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm',
          isUser
            ? 'rounded-br-sm bg-slate-900 text-slate-50'
            : 'rounded-bl-sm bg-slate-50 text-slate-900',
        )}
      >
        {children}
      </div>
    </div>
  );
}
