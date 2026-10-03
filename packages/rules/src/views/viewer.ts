import type { Seat } from '../model/ids';

/**
 * Who is looking. The server derives this from the connection; it is never client-supplied.
 *
 * A spectator is never a player. `handsVisible` lists the seats whose hands that spectator
 * may see face-up (host's view mode); empty means a closed spectator.
 */
export type Viewer =
  | { readonly kind: 'seat'; readonly seat: Seat }
  | { readonly kind: 'spectator'; readonly handsVisible: readonly Seat[] };

export const seatViewer = (seat: Seat): Viewer => ({ kind: 'seat', seat });

export const spectatorViewer = (handsVisible: readonly Seat[] = []): Viewer => ({
  kind: 'spectator',
  handsVisible,
});

/**
 * The visibility table (4.1.2, 4.5-4.12), in one place. Everything the projection reveals
 * goes through these predicates; there is no other path from state to a client.
 *
 *  zone              owner       opponent     closed spectator   hands-visible spectator
 *  ----------------  ----------  -----------  -----------------  -----------------------
 *  hand              ids         count        count              ids (chosen seats)
 *  deck              count       count        count              count (never the order)
 *  evolve deck       ids         count        count              count
 *  face-up revealed  ids         ids          ids                ids
 *  field/EX/cemetery/leader/evolve zone/resolution: public to everyone
 *  banished          face-up: public; face-down: backs only
 */
export const canSeeHand = (viewer: Viewer, owner: Seat): boolean =>
  viewer.kind === 'seat' ? viewer.seat === owner : viewer.handsVisible.includes(owner);

export const canSeeEvolveDeck = (viewer: Viewer, owner: Seat): boolean =>
  viewer.kind === 'seat' && viewer.seat === owner;

/** The seat a prompt's details are addressed to; spectators and opponents see only that a prompt is open. */
export const isAddressedBy = (viewer: Viewer, promptSeat: Seat): boolean =>
  viewer.kind === 'seat' && viewer.seat === promptSeat;
