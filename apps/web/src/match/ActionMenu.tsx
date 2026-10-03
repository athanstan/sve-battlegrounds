import type { Intent, MainOption } from '@sve/rules';
import { Button } from '../ui/primitives';

export interface ActionItem {
  readonly label: string;
  readonly intent: Intent;
}

export function labelsFor(option: MainOption, promptId: number): ActionItem | null {
  switch (option.type) {
    case 'play':
      return {
        label: option.from === 'ex' ? `Play from EX (${option.cost})` : `Play (${option.cost})`,
        intent: { type: 'play', promptId, card: option.card },
      };
    case 'activate':
      return {
        label: option.cost > 0 ? `${option.label} (${option.cost})` : option.label,
        intent: { type: 'activate', promptId, card: option.card, ability: option.ability },
      };
    case 'evolve': {
      const kind = option.superEvolve ? 'Super-evolve' : 'Evolve';
      const pay = option.useEvolutionPoint ? 'EP' : 'PP';
      return {
        label: `${kind} (${option.cost} ${pay})`,
        intent: {
          type: 'evolve',
          promptId,
          card: option.card,
          superEvolve: option.superEvolve,
          useEvolutionPoint: option.useEvolutionPoint,
        },
      };
    }
    case 'attack':
      return null;
  }
}

interface Props {
  readonly items: readonly ActionItem[];
  readonly x: number;
  readonly y: number;
  readonly sending: boolean;
  readonly onChoose: (intent: Intent) => void;
  readonly onAttack?: () => void;
  readonly attackLabel?: string;
  readonly onDismiss: () => void;
}

/** A popover of legal actions for one card, sitting at the press point. */
export function ActionMenu({
  items,
  x,
  y,
  sending,
  onChoose,
  onAttack,
  attackLabel,
  onDismiss,
}: Props) {
  return (
    <div className="absolute inset-0 z-30" onClick={onDismiss} role="presentation">
      <div
        role="menu"
        className="absolute z-40 flex min-w-44 -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-lg border border-gold/50 bg-ink/95 p-2 shadow-xl shadow-black/60"
        style={{ left: x, top: y - 8 }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <Button
            key={item.label}
            tone="plain"
            disabled={sending}
            className="w-full justify-start"
            onClick={() => onChoose(item.intent)}
          >
            {item.label}
          </Button>
        ))}
        {onAttack ? (
          <Button
            tone="primary"
            disabled={sending}
            className="w-full justify-start"
            onClick={onAttack}
          >
            {attackLabel ?? 'Attack'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
