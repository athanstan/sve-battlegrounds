import type { Intent } from '@sve/rules';
import { Button } from '../ui/primitives';
import type { PromptUi } from './prompt-model';

interface Props {
  /** Only the prompts that need a bar: the main phase has the hourglass instead. */
  readonly ui: Extract<PromptUi, { kind: 'choice' } | { kind: 'pick' }>;
  /** Cards picked on the mat so far. */
  readonly picked: number;
  readonly sending: boolean;
  /** A button was pressed: send this answer. */
  readonly onChoose: (intent: Intent) => void;
  /** The cards picked on the mat were confirmed. */
  readonly onConfirm: () => void;
}

/** A question the rules need answered, sitting just above the hand. It exists only while one is open. */
export function PromptBar({ ui, picked, sending, onChoose, onConfirm }: Props) {
  return (
    <div
      role="group"
      aria-label="Decision"
      className="flex items-center gap-4 rounded-lg border border-gold/50 bg-ink/90 px-5 py-2.5 shadow-xl shadow-black/60 backdrop-blur-sm"
    >
      <span className="font-display text-sm tracking-wide text-parchment">{ui.title}</span>
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
