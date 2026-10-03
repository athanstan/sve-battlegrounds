import type { CardId, Seat } from '../model/ids';
import type { BanishedCard, FieldCard, MatchState, SeatState } from './state';
import type { SeatZoneKind, ZoneRef } from './zones-model';

/** Replace one seat's state, leaving the rest of the match untouched. */
export function updateSeat(
  state: MatchState,
  seat: Seat,
  update: (current: SeatState) => SeatState,
): MatchState {
  const current = state.seats[seat];
  const next = update(current);
  if (next === current) return state;
  const seats: [SeatState, SeatState] = [state.seats[0], state.seats[1]];
  seats[seat] = next;
  return { ...state, seats };
}

/** Remove `cards` from `zone`, throwing if any is absent: a missing card is an engine bug, not input. */
export function removeCards(
  zone: readonly CardId[],
  cards: readonly CardId[],
  zoneName: string,
): CardId[] {
  const remaining = [...zone];
  for (const card of cards) {
    const index = remaining.indexOf(card);
    if (index === -1) throw new Error(`Card ${card} is not in ${zoneName}`);
    remaining.splice(index, 1);
  }
  return remaining;
}

/** Remove `cards` from the top of a deck, which must hold exactly those cards in that order. */
export function removeFromTop(deck: readonly CardId[], cards: readonly CardId[]): CardId[] {
  if (cards.length > deck.length || cards.some((card, index) => deck[index] !== card)) {
    throw new Error('Drawn cards do not match the top of the deck');
  }
  return deck.slice(cards.length);
}

export function removeFieldCards(
  field: readonly FieldCard[],
  cards: readonly CardId[],
  zoneName: string,
): FieldCard[] {
  const remaining = [...field];
  for (const card of cards) {
    const index = remaining.findIndex((entry) => entry.id === card);
    if (index === -1) throw new Error(`Card ${card} is not in ${zoneName}`);
    remaining.splice(index, 1);
  }
  return remaining;
}

export function removeBanished(
  zone: readonly BanishedCard[],
  cards: readonly CardId[],
  zoneName: string,
): BanishedCard[] {
  const remaining = [...zone];
  for (const card of cards) {
    const index = remaining.findIndex((entry) => entry.id === card);
    if (index === -1) throw new Error(`Card ${card} is not in ${zoneName}`);
    remaining.splice(index, 1);
  }
  return remaining;
}

export function removeLinks<T extends { card: CardId }>(
  zone: readonly T[],
  cards: readonly CardId[],
  zoneName: string,
): T[] {
  const remaining = [...zone];
  for (const card of cards) {
    const index = remaining.findIndex((entry) => entry.card === card);
    if (index === -1) throw new Error(`Card ${card} is not in ${zoneName}`);
    remaining.splice(index, 1);
  }
  return remaining;
}

export type Located =
  { readonly zone: 'resolution' } | { readonly zone: SeatZoneKind; readonly seat: Seat };

export function locate(state: MatchState, id: CardId): Located | null {
  if (state.resolution.some((entry) => entry.card === id)) return { zone: 'resolution' };
  for (const seat of [0, 1] as const) {
    const s = state.seats[seat];
    if (s.deck.includes(id)) return { zone: 'deck', seat };
    if (s.hand.includes(id)) return { zone: 'hand', seat };
    if (s.field.some((entry) => entry.id === id)) return { zone: 'field', seat };
    if (s.ex.includes(id)) return { zone: 'ex', seat };
    if (s.cemetery.includes(id)) return { zone: 'cemetery', seat };
    if (s.banished.some((entry) => entry.id === id)) return { zone: 'banished', seat };
    if (s.evolveDeck.includes(id)) return { zone: 'evolveDeck', seat };
    if (s.evolveDeckRevealed.includes(id)) return { zone: 'evolveDeckRevealed', seat };
    if (s.evolveZone.some((entry) => entry.card === id)) return { zone: 'evolveZone', seat };
    if (s.raceZone.some((entry) => entry.card === id)) return { zone: 'raceZone', seat };
  }
  return null;
}

export function zoneRefOf(located: Located): ZoneRef {
  return located.zone === 'resolution' ? { zone: 'resolution' } : located;
}
