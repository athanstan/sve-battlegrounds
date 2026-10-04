import type { CardId, Seat } from '../model/ids';
import { definitionOf, type MatchState } from '../state/state';
import type { Cost } from './spec';
import { matchesFilter } from './filters';
import { evaluateCondition } from './values';

export type AtomicCost = Exclude<Cost, { readonly list: readonly Cost[] }>;

export function costParts(cost: Cost): AtomicCost[] {
  if ('list' in cost) return cost.list.flatMap(costParts);
  return [cost];
}

export function costPlayPoints(cost: Cost): number {
  return costParts(cost).reduce(
    (sum, part) => ('playPoints' in part ? sum + part.playPoints : sum),
    0,
  );
}

export function costEngages(cost: Cost): boolean {
  return costParts(cost).some((part) => 'engage' in part);
}

export function costBuriesSelf(cost: Cost): boolean {
  return costParts(cost).some((part) => 'burySelf' in part);
}

export function costLeaderDefense(cost: Cost): number {
  return costParts(cost).reduce(
    (sum, part) => ('leaderDefense' in part ? sum + part.leaderDefense : sum),
    0,
  );
}

export function costLesson(cost: Cost): number {
  return costParts(cost).reduce((sum, part) => ('lesson' in part ? sum + part.lesson : sum), 0);
}

function magicalItems(state: MatchState, seat: Seat): CardId[] {
  return state.seats[seat].ex.filter((id) => {
    const def = definitionOf(state, id);
    return def.name.toLowerCase().includes('magical item') || def.traits.includes('Magical Item');
  });
}

/** Whether every atom of this cost can be paid right now (R6). */
export function canPayCost(state: MatchState, seat: Seat, card: CardId, cost: Cost): boolean {
  for (const part of costParts(cost)) {
    if ('playPoints' in part && part.playPoints > state.seats[seat].resources.playPoints) {
      return false;
    }
    if ('engage' in part) {
      const field = state.seats[seat].field.find((entry) => entry.id === card);
      if (field?.placement !== 'reserved') return false;
    }
    if ('burySelf' in part && !state.seats[seat].field.some((entry) => entry.id === card)) {
      return false;
    }
    if ('leaderDefense' in part && part.leaderDefense > state.seats[seat].leader.defense) {
      return false;
    }
    if ('lesson' in part && magicalItems(state, seat).length < part.lesson) return false;
    if ('necrocharge' in part && state.seats[seat].cemetery.length < part.necrocharge) return false;
    if ('spellchain' in part && state.seats[seat].flags.spellsPlayed < part.spellchain) {
      return false;
    }
    if ('earthRite' in part && !evaluateCondition(state, seat, { earthRite: true }, {}, card)) {
      return false;
    }
    if ('discard' in part) {
      const matching = state.seats[seat].hand.filter(
        (id) => id !== card && matchesFilter(state, id, part.discard.filter, card),
      );
      if (matching.length < part.discard.n) return false;
    }
    if ('banish' in part) {
      const from = part.banish.from;
      const zone = from?.zone ?? 'field';
      const pool =
        zone === 'ex'
          ? state.seats[seat].ex
          : zone === 'hand'
            ? state.seats[seat].hand
            : state.seats[seat].field.map((entry) => entry.id);
      const matching = pool.filter((id) => matchesFilter(state, id, part.banish.filter, card));
      if (matching.length < part.banish.n) return false;
    }
    if ('bury' in part) {
      const from = part.bury.from;
      const zone = from?.zone ?? 'field';
      const pool =
        zone === 'hand'
          ? state.seats[seat].hand
          : zone === 'ex'
            ? state.seats[seat].ex
            : state.seats[seat].field.map((entry) => entry.id);
      const matching = pool.filter(
        (id) => id !== card && matchesFilter(state, id, part.bury.filter, card),
      );
      if (matching.length < part.bury.n) return false;
    }
    if ('counters' in part) {
      const field = state.seats[seat].field.find((entry) => entry.id === card);
      if ((field?.counters[part.counters.name] ?? 0) < part.counters.n) return false;
    }
    if ('fuse' in part) {
      const matching = state.seats[seat].hand.filter(
        (id) => id !== card && matchesFilter(state, id, part.fuse.filter, card),
      );
      if (matching.length < part.fuse.n) return false;
    }
    if ('engageOther' in part) {
      const other = state.seats[seat].field.filter(
        (entry) =>
          entry.id !== card &&
          entry.placement === 'reserved' &&
          matchesFilter(state, entry.id, part.engageOther, card),
      );
      if (other.length === 0) return false;
    }
  }
  return true;
}

export { magicalItems };
