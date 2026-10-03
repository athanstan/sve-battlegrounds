import { Button } from '../ui/primitives';
import type { OutcomeText } from './outcome-text';

const TONES = { win: 'text-gold-bright', loss: 'text-danger', neutral: 'text-parchment' } as const;

export function GameOver({ result, onLeave }: { result: OutcomeText; onLeave: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div
        role="dialog"
        aria-label="Match over"
        className="pointer-events-auto rounded-xl border border-gold/40 bg-ink/90 px-12 py-8 text-center shadow-2xl shadow-black/70 backdrop-blur"
      >
        <div className={`font-display text-5xl tracking-widest ${TONES[result.tone]}`}>
          {result.headline}
        </div>
        <div className="mt-2 text-sm text-mist">{result.reason}</div>
        <Button tone="primary" className="mt-6" onClick={onLeave}>
          Back to the lobby
        </Button>
      </div>
    </div>
  );
}
