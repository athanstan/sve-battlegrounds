import type { CardId, Seat } from '../model/ids';
import { definitionOf, type MatchState } from '../state/state';
import type { CardFilter, Cost, Place, SpellAbility } from './spec';
import { gather, matchesFilter } from './filters';
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

/** "As an additional cost to play this card…", if the card is a spell that has one. */
export function additionalCostOf(state: MatchState, card: CardId): Cost | undefined {
  const def = definitionOf(state, card);
  if (def.kind !== 'spell') return undefined;
  const spell = state.scripts[def.id]?.abilities.find((ability) => ability.kind === 'spell');
  return spell?.kind === 'spell' ? spell.additionalCost : undefined;
}

/** The parts of a cost the player must pick cards for, in the order they are asked. */
export function pickedCostParts(
  cost: Cost,
): readonly Extract<AtomicCost, { readonly reveal: unknown } | { readonly discard: unknown }>[] {
  return costParts(cost).filter(
    (
      part,
    ): part is Extract<AtomicCost, { readonly reveal: unknown } | { readonly discard: unknown }> =>
      'reveal' in part || 'discard' in part,
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
    if ('reveal' in part) {
      const matching = state.seats[seat].hand.filter(
        (id) => id !== card && matchesFilter(state, id, part.reveal.filter, card),
      );
      if (matching.length < part.reveal.n) return false;
    }
    if ('banish' in part) {
      const from = part.banish.from ?? { zone: 'field' as const, who: 'you' as const };
      if (gather(state, seat, [from], part.banish.filter, card).length < part.banish.n)
        return false;
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

/** What an optional play-time extra cost asks the player to pick, and where. */
export function extraCostPick(extra: NonNullable<SpellAbility['extraCost']>): {
  readonly n: number;
  readonly filter?: CardFilter;
  readonly from: Place;
  readonly where: 'mat' | 'browser';
  readonly kind: 'discard' | 'banish';
} {
  if (extra.banish) {
    const from = extra.banish.from;
    const where =
      from.zone === 'cemetery' || from.zone === 'deck' || from.zone === 'evolveDeck'
        ? 'browser'
        : 'mat';
    return {
      n: extra.banish.n,
      ...(extra.banish.filter ? { filter: extra.banish.filter } : {}),
      from,
      where,
      kind: 'banish',
    };
  }
  return {
    n: extra.discard?.n ?? 0,
    ...(extra.discard?.filter ? { filter: extra.discard.filter } : {}),
    from: { zone: 'hand', who: 'you' },
    where: 'mat',
    kind: 'discard',
  };
}

export function extraCostCandidates(
  state: MatchState,
  seat: Seat,
  card: CardId,
  extra: NonNullable<SpellAbility['extraCost']>,
): CardId[] {
  const pick = extraCostPick(extra);
  return gather(state, seat, [pick.from], pick.filter, card).filter((id) => id !== card);
}

export function canPayExtraCost(
  state: MatchState,
  seat: Seat,
  card: CardId,
  extra: NonNullable<SpellAbility['extraCost']>,
): boolean {
  return extraCostCandidates(state, seat, card, extra).length >= extraCostPick(extra).n;
}

export { magicalItems };
