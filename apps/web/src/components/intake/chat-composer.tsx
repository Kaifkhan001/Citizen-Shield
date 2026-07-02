'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface ChatComposerProps {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Composer at the bottom of the chat: textarea + Send button. Enter
 * sends; Shift+Enter inserts a newline (standard chat convention).
 */
export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = "Tell me what's going on…",
}: ChatComposerProps): React.ReactElement {
  const [value, setValue] = useState('');

  async function send(): Promise<void> {
    const text = value.trim();
    if (!text) return;
    setValue('');
    await onSend(text);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex items-end gap-2 border-t border-slate-200 bg-white p-4"
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className="resize-none"
      />
      <Button type="submit" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
