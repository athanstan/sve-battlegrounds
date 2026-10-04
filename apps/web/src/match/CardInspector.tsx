import type { CardDefinition } from '@sve/rules';
import { CLASS_STYLE } from '@sve/playmat/theme';
import { keywordLabel, textLines, type TextRun } from './card-text';

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

const KIND: Readonly<Record<CardDefinition['kind'], string>> = {
  leader: 'Leader',
  follower: 'Follower',
  spell: 'Spell',
  amulet: 'Amulet',
  equipment: 'Equipment',
  crest: 'Crest',
};

interface Props {
  readonly def: CardDefinition;
  /** What the card is right now on the field, when that differs from what is printed. */
  readonly shown?: { readonly attack: number; readonly defense: number } | undefined;
  /** Which edge it sits on; the table puts it opposite the card being read. */
  readonly side: 'left' | 'right';
  readonly onClose: () => void;
  /** Reading and scrolling means the pointer leaves the card; the table keeps the panel open. */
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

function Run({ run }: { run: TextRun }) {
  switch (run.kind) {
    case 'text':
      return <>{run.text}</>;
    case 'cost':
      return (
        <span className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 align-text-bottom text-xs font-semibold text-ink">
          {run.amount}
        </span>
      );
    case 'tag':
      return (
        <span className="mx-0.5 rounded bg-slab-raised px-1.5 py-0.5 text-xs font-semibold text-gold-bright">
          {run.label}
        </span>
      );
  }
}

/** The card under the pointer, readable: its name, art, stats and the full text, scrollable. */
export function CardInspector({
  def,
  shown,
  side,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const accent = hex(CLASS_STYLE[def.cardClass].main);
  const lines = textLines(def.text);
  const isFollower = def.kind === 'follower';
  const attack = shown?.attack ?? def.attack;
  const defense = shown?.defense ?? def.defense;
  const kind = [
    def.special === 'token' ? 'Token' : null,
    def.special === 'evolved' ? 'Evolved' : null,
    KIND[def.kind],
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return (
    <aside
      aria-label={`${def.name}, card text`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ borderTopColor: accent }}
      className={`absolute inset-y-0 z-20 flex w-[clamp(16rem,24vw,23rem)] flex-col border-t-4 bg-basalt/95 shadow-2xl shadow-black/60 backdrop-blur ${
        side === 'left' ? 'left-0 border-r border-slab' : 'right-0 border-l border-slab'
      }`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
        <h2 className="font-display text-lg leading-tight text-parchment">{def.name}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card text"
          title="Close (Esc)"
          className="shrink-0 rounded px-1.5 text-mist hover:bg-slab hover:text-parchment"
        >
          ✕
        </button>
      </header>

      <div className="flex gap-3 px-4 pb-3">
        {def.artUrl ? (
          <img
            src={def.artUrl}
            alt=""
            className="aspect-[5/7] w-28 shrink-0 rounded-md border border-slab object-cover"
          />
        ) : (
          <div className="flex aspect-[5/7] w-28 shrink-0 items-center justify-center rounded-md border border-slab bg-ink p-2 text-center text-xs text-mist">
            No art
          </div>
        )}
        <dl className="min-w-0 space-y-1 text-sm">
          <div className="font-semibold" style={{ color: accent }}>
            {CLASS_STYLE[def.cardClass].name}
          </div>
          <div className="text-parchment">{kind}</div>
          {def.kind !== 'leader' ? (
            <div className="text-mist">
              Cost <span className="font-semibold text-gold-bright">{def.cost}</span>
            </div>
          ) : null}
          {isFollower && attack !== null && defense !== null ? (
            <div className="text-mist">
              <span className="font-semibold text-parchment">{attack}</span>
              {' / '}
              <span className="font-semibold text-parchment">{defense}</span>
              {shown && (shown.attack !== def.attack || shown.defense !== def.defense) ? (
                <span className="ml-1 text-xs">
                  (printed {def.attack} / {def.defense})
                </span>
              ) : null}
            </div>
          ) : null}
          {def.traits.length > 0 ? (
            <div className="text-xs text-mist">{def.traits.join(' · ')}</div>
          ) : null}
        </dl>
      </div>

      <div
        className="h-1 shrink-0"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        aria-hidden
      />

      {def.keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-4 pt-3">
          {def.keywords.map((keyword) => (
            <li
              key={keyword}
              className="rounded-full border border-slab-raised px-2 py-0.5 text-xs text-gold-bright"
            >
              {keywordLabel(keyword)}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        tabIndex={0}
        aria-label="Card text"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 text-[0.95rem] leading-relaxed text-parchment"
      >
        {lines.length === 0 ? (
          <p className="text-mist">This card has no text.</p>
        ) : (
          lines.map((runs, index) => (
            <p key={index}>
              {runs.map((run, at) => (
                <Run key={at} run={run} />
              ))}
            </p>
          ))
        )}
        {def.scripted === false && lines.length > 0 ? (
          <p className="rounded-md border border-danger/40 bg-ink/60 px-3 py-2 text-xs text-mist">
            Printed effects are not automated for this card yet.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
