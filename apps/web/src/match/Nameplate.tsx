import type { SeatPlate } from '../net/presence';

interface Props {
  readonly plate: SeatPlate | undefined;
  readonly fallback: string;
  readonly you: boolean;
}

type Standing = 'empty' | 'connected' | 'away';

const STANDING: Readonly<Record<Standing, { dot: string; label: string }>> = {
  empty: { dot: 'bg-mist/40', label: 'Empty seat' },
  connected: { dot: 'bg-ok', label: 'Connected' },
  away: { dot: 'bg-danger', label: 'Disconnected' },
};

const standingOf = (plate: SeatPlate | undefined): Standing => {
  if (!plate?.occupied) return 'empty';
  return plate.connected ? 'connected' : 'away';
};

/** A player's name beside their leader. A dot says whether they are still connected. */
export function Nameplate({ plate, fallback, you }: Props) {
  const standing = standingOf(plate);
  const name = plate?.occupied ? plate.displayName : fallback;
  return (
    <div
      className="flex max-w-[170px] items-center justify-center gap-2"
      title={plate?.deckName === '' ? undefined : plate?.deckName}
    >
      <span
        className={`size-2 shrink-0 rounded-full ${STANDING[standing].dot}`}
        role="img"
        aria-label={STANDING[standing].label}
      />
      <span
        className={`truncate font-display text-[15px] tracking-wide ${standing === 'empty' ? 'text-mist' : 'text-parchment'}`}
      >
        {name}
      </span>
      {you ? <span className="text-[10px] uppercase tracking-widest text-gold">you</span> : null}
    </div>
  );
}
