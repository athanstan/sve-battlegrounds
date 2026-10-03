import type { ChatLine } from '@sve/protocol';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../ui/primitives';

interface Props {
  readonly lines: readonly ChatLine[];
  /** Spectators speak on a channel the players never see; they are told so. */
  readonly spectating: boolean;
  readonly canSpeak: boolean;
  readonly onSay: (text: string) => void;
  readonly onClose: () => void;
}

export function ChatPanel({ lines, spectating, canSpeak, onSay, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest line in view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onSay(draft);
    setDraft('');
  };

  return (
    <aside
      aria-label="Chat"
      className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-slab bg-basalt/95 shadow-2xl shadow-black/60 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-slab px-4 py-3">
        <h2 className="font-display text-base tracking-wide text-gold-bright">Chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="text-mist hover:text-parchment"
        >
          ✕
        </button>
      </header>

      <div
        className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm"
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 ? <p className="text-mist">Nothing said yet.</p> : null}
        {lines.map((line) => (
          <p key={line.id} className="break-words">
            <span className={line.author.seat === null ? 'text-legal' : 'text-gold'}>
              {line.author.displayName}
            </span>
            {line.channel === 'spectators' ? (
              <span className="ml-1 text-[10px] uppercase text-mist">gallery</span>
            ) : null}
            <span className="text-mist">: </span>
            <span className="text-parchment">{line.text}</span>
          </p>
        ))}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="border-t border-slab p-3">
        {spectating ? (
          <p className="mb-2 text-xs text-mist">Players cannot read what spectators write.</p>
        ) : null}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={280}
            disabled={!canSpeak}
            placeholder={canSpeak ? 'Say something…' : 'Reconnecting…'}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-md bg-slab px-3 py-2 text-sm text-parchment placeholder:text-mist/70 disabled:opacity-50"
          />
          <Button type="submit" tone="primary" disabled={!canSpeak || !draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </aside>
  );
}
