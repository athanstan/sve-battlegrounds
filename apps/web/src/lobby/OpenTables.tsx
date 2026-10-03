import type { MatchListing } from '@sve/protocol';
import { Button } from '../ui/primitives';

const STATUS: Record<MatchListing['status'], { label: string; tone: string }> = {
  waiting: { label: 'Waiting for an opponent', tone: 'text-ok' },
  playing: { label: 'In progress', tone: 'text-gold' },
  finished: { label: 'Finished', tone: 'text-mist' },
};

interface Props {
  readonly matches: readonly MatchListing[];
  /** Whether the user has picked a deck they could sit down with. */
  readonly canSit: boolean;
  readonly busy: boolean;
  /** Tables this browser already has a seat at: offered a way back rather than a second seat. */
  readonly isMine: (roomId: string) => boolean;
  readonly onReturn: (roomId: string) => void;
  readonly onSit: (roomId: string) => void;
  readonly onWatch: (roomId: string) => void;
}

export function OpenTables({
  matches: all,
  canSit,
  busy,
  isMine,
  onReturn,
  onSit,
  onWatch,
}: Props) {
  // A finished match has nothing left to offer: you can neither sit at it nor watch it.
  const matches = all.filter((match) => match.status !== 'finished' || isMine(match.roomId));
  if (matches.length === 0) {
    return (
      <p className="text-sm text-mist">
        No tables yet. Start one and it will appear here for others to join.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {matches.map((match) => (
        <li
          key={match.roomId}
          className="flex items-center justify-between gap-4 rounded-md bg-slab/60 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="truncate font-medium">{match.title}</div>
            <div className="text-xs text-mist">
              <span className={STATUS[match.status].tone}>{STATUS[match.status].label}</span>
              {match.players.length > 0 ? ` · ${match.players.join(' vs ')}` : ''}
              {match.spectators > 0 ? ` · ${match.spectators} watching` : ''}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {isMine(match.roomId) ? (
              <Button tone="primary" onClick={() => onReturn(match.roomId)}>
                Return to table
              </Button>
            ) : null}
            {!isMine(match.roomId) && match.status === 'waiting' ? (
              <Button tone="primary" disabled={!canSit || busy} onClick={() => onSit(match.roomId)}>
                Sit down
              </Button>
            ) : null}
            {!isMine(match.roomId) && match.status !== 'finished' ? (
              <Button disabled={busy} onClick={() => onWatch(match.roomId)}>
                Watch
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
