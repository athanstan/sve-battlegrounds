import type { Seat } from '../model/ids';

/**
 * Every place a card can sit (4). `resolution` is the one shared zone (4.11); every other
 * zone belongs to a seat.
 */
export type ZoneKind =
  | 'deck'
  | 'hand'
  | 'field'
  | 'ex'
  | 'cemetery'
  | 'banished'
  | 'evolveDeck'
  | 'evolveDeckRevealed'
  | 'evolveZone'
  | 'raceZone'
  | 'resolution';

export type SeatZoneKind = Exclude<ZoneKind, 'resolution'>;

export type ZoneRef =
  { readonly zone: 'resolution' } | { readonly zone: SeatZoneKind; readonly seat: Seat };

/** Why a card changed zones. Informs triggers; never a client intent. */
export type MoveCause =
  | 'play'
  | 'summon'
  | 'destroy'
  | 'banish'
  | 'bury'
  | 'discard'
  | 'draw'
  | 'search'
  | 'look'
  | 'evolve'
  | 'serve'
  | 'token'
  | 'eliminate'
  | 'return'
  | 'effect'
  | 'rules';

/** Public zones (4.1.2): every viewer may read the identities. */
export const isPublicZone = (ref: ZoneRef, faceDown = false): boolean => {
  if (ref.zone === 'resolution') return true;
  if (faceDown && ref.zone === 'banished') return false;
  switch (ref.zone) {
    case 'field':
    case 'ex':
    case 'cemetery':
    case 'banished':
    case 'evolveZone':
    case 'raceZone':
    case 'evolveDeckRevealed':
      return true;
    case 'deck':
    case 'hand':
    case 'evolveDeck':
      return false;
  }
};

export const sameZone = (a: ZoneRef, b: ZoneRef): boolean => {
  if (a.zone === 'resolution' || b.zone === 'resolution') {
    return a.zone === 'resolution' && b.zone === 'resolution';
  }
  return a.zone === b.zone && a.seat === b.seat;
};
