/**
 * Three pulsing dots that indicate the assistant is "thinking" while
 * the AI request is in flight. Mirrors the eventual streaming UX
 * (M5) so the visual contract doesn't change when the wire format
 * does.
 */
export function TypingIndicator(): React.ReactElement {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-50 px-4 py-3 shadow-sm">
      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
    </div>
  );
}
