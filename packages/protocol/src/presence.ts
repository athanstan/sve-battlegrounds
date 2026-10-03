import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * The only thing synchronised as Colyseus state: who is at the table and whether they are
 * connected. The match itself travels as filtered messages (see `match.ts`), because per-viewer
 * hidden information is not something a shared state tree can express safely.
 *
 * Nothing here is secret: names, a deck's title and connection flags are what a lobby shows.
 */

export const SeatPresence = schema(
  {
    occupied: t.boolean().default(false),
    userId: t.string().default(''),
    displayName: t.string().default(''),
    avatarUrl: t.string().default(''),
    deckName: t.string().default(''),
    connected: t.boolean().default(false),
  },
  'SeatPresence',
);
export type SeatPresence = SchemaType<typeof SeatPresence>;

export const MatchPresence = schema(
  {
    /** `waiting` for an opponent, `playing`, or `finished`. */
    status: t.string().default('waiting'),
    title: t.string().default(''),
    seats: t.array(SeatPresence),
    spectators: t.uint16().default(0),
  },
  'MatchPresence',
);
export type MatchPresence = SchemaType<typeof MatchPresence>;
