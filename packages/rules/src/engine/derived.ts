import {
  definitionOf,
  isBoxed,
  type FieldCard,
  type MatchState,
  type ShownStats,
} from '../state/state';
import { SEATS, type CardId, type Seat } from '../model/ids';
import type { Keyword } from '../model/cards';
import { updateSeat } from '../state/zones';
import type { Transcript } from './transcript';
import { applyStaticGrants } from '../abilities/statics';

/** Printed stats plus modifiers, grants, damage, statics and evolve-link info (10.9). */
export function computeShown(state: MatchState, card: FieldCard, seat: Seat): ShownStats {
  const def = definitionOf(state, card.id);
  const evolvedOwner = state.cards[card.id]?.owner ?? seat;
  const link = state.seats[evolvedOwner].evolveZone.find((entry) => entry.linkedTo === card.id);
  const info = link ? { ...definitionOf(state, link.card), cost: def.cost } : def;
  const keywords = new Set<Keyword>(info.keywords);
  for (const grant of card.granted) keywords.add(grant.keyword);
  let attack = info.attack ?? 0;
  let defense = info.defense ?? 0;
  for (const mod of card.modifiers) {
    attack += mod.attack;
    defense += mod.defense;
  }
  if (card.racedTimes > 0) keywords.add('rush'); // 14.2.3
  const withStatics = applyStaticGrants(state, card, seat, {
    attack,
    defense,
    keywords: [...keywords],
  });
  const unique = new Set<Keyword>(withStatics.keywords);
  return {
    attack: withStatics.attack,
    defense: withStatics.defense - card.damageTaken,
    keywords: isBoxed(card, state.turn) ? [] : [...unique],
  };
}

export function shownEqual(a: ShownStats, b: ShownStats): boolean {
  if (a.attack !== b.attack || a.defense !== b.defense) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  return a.keywords.every((keyword, index) => keyword === b.keywords[index]);
}

/** Recompute `shown` for every field card; emit only when something changed. */
export function refreshDerived(t: Transcript): void {
  for (const seat of SEATS) {
    for (const card of t.state.seats[seat].field) {
      const shown = computeShown(t.state, card, seat);
      if (shownEqual(card.shown, shown)) continue;
      t.emit({
        type: 'fieldCardUpdated',
        seat,
        card: card.id,
        field: { ...card, shown },
      });
    }
  }
}

export function fieldOf(state: MatchState, id: CardId): { seat: Seat; card: FieldCard } | null {
  for (const seat of SEATS) {
    const card = state.seats[seat].field.find((entry) => entry.id === id);
    if (card) return { seat, card };
  }
  return null;
}

export function hasShownKeyword(state: MatchState, id: CardId, keyword: Keyword): boolean {
  const found = fieldOf(state, id);
  if (found) return found.card.shown.keywords.includes(keyword);
  if (!state.cards[id]) return false;
  return definitionOf(state, id).keywords.includes(keyword);
}

export function patchField(
  state: MatchState,
  seat: Seat,
  id: CardId,
  patch: (card: FieldCard) => FieldCard,
): MatchState {
  return updateSeat(state, seat, (s) => ({
    ...s,
    field: s.field.map((card) => (card.id === id ? patch(card) : card)),
  }));
}
