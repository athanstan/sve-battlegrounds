import type { CardId, Intent } from '@sve/rules';
import { useMemo, useState } from 'react';
import { Button } from '../ui/primitives';

interface Props {
  readonly promptId: number;
  readonly title: string;
  readonly total: number;
  readonly targets: readonly CardId[];
  readonly names: Readonly<Record<string, string>>;
  readonly sending: boolean;
  readonly onChoose: (intent: Intent) => void;
}

/** Per-target steppers that must sum to `total` (divided damage). */
export function AllocateBar({ promptId, title, total, targets, names, sending, onChoose }: Props) {
  const [amounts, setAmounts] = useState<number[]>(() =>
    targets.map((_, index) => (index === 0 ? total : 0)),
  );
  const sum = amounts.reduce((a, b) => a + b, 0);
  const leftover = total - sum;

  const bump = (index: number, delta: number) => {
    setAmounts((current) => {
      const next = [...current];
      const value = Math.max(0, (next[index] ?? 0) + delta);
      next[index] = value;
      return next;
    });
  };

  const intent = useMemo<Intent>(
    () => ({
      type: 'choose',
      promptId,
      choice: { kind: 'allocate', amounts },
    }),
    [amounts, promptId],
  );

  return (
    <div
      role="group"
      className="flex flex-col gap-2 rounded-lg border border-gold/50 bg-ink/90 px-5 py-3 shadow-xl"
    >
      <span className="font-display text-sm text-parchment">{title}</span>
      <div className="flex flex-wrap gap-3">
        {targets.map((id, index) => (
          <div key={id} className="flex items-center gap-2 rounded-md border border-slab px-2 py-1">
            <span className="text-xs text-mist">{names[id] ?? id}</span>
            <Button
              disabled={sending || (amounts[index] ?? 0) <= 0}
              onClick={() => bump(index, -1)}
            >
              −
            </Button>
            <span className="min-w-6 text-center text-parchment">{amounts[index]}</span>
            <Button disabled={sending || leftover <= 0} onClick={() => bump(index, 1)}>
              +
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-mist">{leftover === 0 ? 'Ready' : `${leftover} left`}</span>
        <Button
          tone="primary"
          disabled={sending || leftover !== 0}
          onClick={() => onChoose(intent)}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}
