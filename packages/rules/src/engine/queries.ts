import { hasKeyword } from '../model/cards';
import { opponentOf, type CardId, type Seat } from '../model/ids';
import { definitionOf, type MatchState } from '../state/state';

/** Seat that goes first. Only valid once turn order has been chosen (6.2.1.6). */
export function firstSeat(state: MatchState): Seat {
  if (state.first === null) throw new Error('Turn order has not been chosen yet');
  return state.first;
}

export function secondSeat(state: MatchState): Seat {
  return opponentOf(firstSeat(state));
}

export function activeSeat(state: MatchState): Seat {
  if (state.active === null) throw new Error('No turn is in progress');
  return state.active;
}

/** Reserved Ward followers that may be engaged during the end phase (7.4.3, 12.8.2). */
export function wardCandidates(state: MatchState, seat: Seat): readonly CardId[] {
  return state.seats[seat].field
    .filter((fieldCard) => {
      if (fieldCard.placement !== 'reserved') return false;
      const def = definitionOf(state, fieldCard.id);
      return def.kind === 'follower' && hasKeyword(def, 'ward');
    })
    .map((fieldCard) => fieldCard.id);
}

/**
 * True when `selected` is made of distinct members of `candidates` and, if `size` is given,
 * has exactly that many entries.
 */
export function isSelection(
  selected: readonly CardId[],
  candidates: readonly CardId[],
  size?: number,
): boolean {
  if (size !== undefined && selected.length !== size) return false;
  if (new Set(selected).size !== selected.length) return false;
  return selected.every((card) => candidates.includes(card));
}

/** True when every card is a copy of the same definition, so no choice among them can matter. */
export function areInterchangeable(state: MatchState, cards: readonly CardId[]): boolean {
  const [first, ...rest] = cards;
  if (first === undefined) return true;
  const def = state.cards[first]?.def;
  return rest.every((card) => state.cards[card]?.def === def);
}
