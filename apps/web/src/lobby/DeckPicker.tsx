import type { DeckSummaryDto } from '@sve/protocol';
// The palette alone, from its own entry: the lobby must not pull in the rendering engine.
import { CLASS_STYLE } from '@sve/playmat/theme';
import { describeDeckIssue } from './deck-issues';

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

interface Props {
  readonly decks: readonly DeckSummaryDto[];
  readonly selected: string | null;
  readonly onSelect: (deckId: string) => void;
}

/** The user's decks from shadowshowdown.com. A deck the rules would refuse is shown, with why, but cannot be chosen. */
export function DeckPicker({ decks, selected, onSelect }: Props) {
  return (
    <ul className="grid gap-2" role="radiogroup" aria-label="Your decks">
      {decks.map((deck) => {
        const accent = hex(CLASS_STYLE[deck.leader.cardClass].main);
        const isSelected = deck.id === selected;
        return (
          <li key={deck.id}>
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!deck.legal}
              onClick={() => onSelect(deck.id)}
              style={{ borderLeftColor: accent }}
              className={`w-full rounded-md border border-l-4 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-gold bg-slab-raised'
                  : 'border-slab bg-slab/60 enabled:hover:bg-slab disabled:opacity-60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{deck.name}</span>
                <span className="text-xs text-mist">
                  {deck.mainCount} + {deck.evolveCount}
                </span>
              </div>
              <div className="text-xs" style={{ color: accent }}>
                {deck.leader.name} · {CLASS_STYLE[deck.leader.cardClass].name}
              </div>
              {deck.legal ? null : (
                <ul className="mt-1.5 list-disc pl-4 text-xs text-danger">
                  {deck.issues.slice(0, 2).map((issue, index) => (
                    <li key={index}>{describeDeckIssue(issue)}</li>
                  ))}
                  {deck.issues.length > 2 ? <li>and {deck.issues.length - 2} more</li> : null}
                </ul>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
