/**
 * Who is at the table, as the lobby and nameplates show it. Read from the synchronised room
 * state (the protocol's `MatchPresence`), which carries nothing secret.
 */

export interface SeatPlate {
  readonly occupied: boolean;
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly deckName: string;
  readonly connected: boolean;
}

export type TableStatus = 'waiting' | 'playing' | 'finished';

export interface Presence {
  readonly status: TableStatus;
  readonly title: string;
  readonly seats: readonly [SeatPlate, SeatPlate];
  readonly spectators: number;
}

const EMPTY_SEAT: SeatPlate = {
  occupied: false,
  userId: '',
  displayName: '',
  avatarUrl: null,
  deckName: '',
  connected: false,
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function readSeat(value: unknown): SeatPlate {
  if (typeof value !== 'object' || value === null) return EMPTY_SEAT;
  const seat = value as Record<string, unknown>;
  return {
    occupied: seat.occupied === true,
    userId: text(seat.userId),
    displayName: text(seat.displayName),
    avatarUrl: text(seat.avatarUrl) || null,
    deckName: text(seat.deckName),
    connected: seat.connected === true,
  };
}

/** Copy the room state into plain data, defensively: it is decoded from the wire. */
export function readPresence(state: unknown): Presence | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = state as { status?: unknown; title?: unknown; seats?: unknown; spectators?: unknown };
  const seats = raw.seats as ArrayLike<unknown> | undefined;
  const status = raw.status === 'playing' || raw.status === 'finished' ? raw.status : 'waiting';
  return {
    status,
    title: text(raw.title),
    seats: [readSeat(seats?.[0]), readSeat(seats?.[1])],
    spectators: typeof raw.spectators === 'number' ? raw.spectators : 0,
  };
}
