import type { Intent } from '@sve/rules';
import { useState } from 'react';
import { Button } from '../ui/primitives';
import type { PromptUi } from './prompt-model';

interface Props {
  /** Only the prompts that need a bar: the main phase has the hourglass instead. */
  readonly ui: Extract<PromptUi, { kind: 'choice' } | { kind: 'pick' }>;
  /** Cards picked on the mat so far. */
  readonly picked: number;
  readonly sending: boolean;
  /** Larger, centred panel for questions that happen before there is a hand (turn order). */
  readonly prominent?: boolean;
  /** A button was pressed: send this answer. */
  readonly onChoose: (intent: Intent) => void;
  /** The cards picked on the mat were confirmed. */
  readonly onConfirm: () => void;
}

/** A question the rules need answered, sitting just above the hand. It exists only while one is open. */
export function PromptBar({ ui, picked, sending, prominent = false, onChoose, onConfirm }: Props) {
  return (
    <div
      role="group"
      aria-label="Decision"
      className={
        prominent
          ? 'flex flex-col items-center gap-4 rounded-xl border border-gold/60 bg-ink/95 px-10 py-6 shadow-2xl shadow-black/70 backdrop-blur-sm'
          : 'flex items-center gap-4 rounded-lg border border-gold/50 bg-ink/90 px-5 py-2.5 shadow-xl shadow-black/60 backdrop-blur-sm'
      }
    >
      <span
        className={`font-display tracking-wide text-parchment ${prominent ? 'text-lg' : 'text-sm'}`}
      >
        {ui.title}
      </span>
      <div className="flex gap-2">
        {ui.kind === 'choice' ? (
          ui.options.map((option) => (
            <Button
              key={option.label}
              tone={option.primary ? 'primary' : 'plain'}
              disabled={sending}
              onClick={() => onChoose(option.intent)}
            >
              {option.label}
            </Button>
          ))
        ) : (
          <Button tone="primary" disabled={sending || !ui.canConfirm(picked)} onClick={onConfirm}>
            {ui.confirmLabel(picked)}
          </Button>
        )}
      </div>
    </div>
  );
}

const barClass =
  'flex items-center gap-4 rounded-lg border border-gold/50 bg-ink/90 px-5 py-2.5 shadow-xl shadow-black/60 backdrop-blur-sm';

export function NumberBar({
  ui,
  sending,
  onChoose,
}: {
  readonly ui: Extract<PromptUi, { kind: 'number' }>;
  readonly sending: boolean;
  readonly onChoose: (intent: Intent) => void;
}) {
  const [value, setValue] = useState(String(ui.min));
  const n = Number(value);
  const ok = Number.isInteger(n) && n >= ui.min && n <= ui.max;
  return (
    <div role="group" aria-label="Decision" className={barClass}>
      <span className="font-display text-sm tracking-wide text-parchment">{ui.title}</span>
      <input
        type="number"
        min={ui.min}
        max={ui.max}
        value={value}
        disabled={sending}
        onChange={(event) => setValue(event.target.value)}
        className="w-20 rounded-md border border-slab bg-ink px-2 py-1 text-parchment"
      />
      <Button tone="primary" disabled={sending || !ok} onClick={() => onChoose(ui.intent(n))}>
        Confirm
      </Button>
    </div>
  );
}

export function TextBar({
  ui,
  sending,
  onChoose,
}: {
  readonly ui: Extract<PromptUi, { kind: 'text' }>;
  readonly sending: boolean;
  readonly onChoose: (intent: Intent) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div role="group" aria-label="Decision" className={barClass}>
      <span className="font-display text-sm tracking-wide text-parchment">{ui.title}</span>
      <input
        type="text"
        value={value}
        disabled={sending}
        onChange={(event) => setValue(event.target.value)}
        className="w-48 rounded-md border border-slab bg-ink px-2 py-1 text-parchment"
      />
      <Button
        tone="primary"
        disabled={sending || value.trim().length === 0}
        onClick={() => onChoose(ui.intent(value.trim()))}
      >
        Confirm
      </Button>
    </div>
  );
}
