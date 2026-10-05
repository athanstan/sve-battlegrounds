import type { Keyword } from '../model/cards';
import { SEATS, type CardId, type Seat } from '../model/ids';
import {
  definitionOf,
  isBoxed,
  type FieldCard,
  type MatchState,
  type PlayDiscount,
  type ShownStats,
} from '../state/state';
import type { Replacement, Restriction, StaticAbility } from './spec';
import { evaluateCondition, evaluateValue } from './values';
import { matchesFilter } from './filters';
import { parseEvolveCost } from './generic';
import { locate } from '../state/zones';

export function staticsInZone(
  state: MatchState,
  seat: Seat,
  zone: 'field' | 'ex' | 'hand',
): readonly { readonly source: CardId; readonly ability: StaticAbility }[] {
  const ids =
    zone === 'field'
      ? state.seats[seat].field.map((card) => card.id)
      : zone === 'ex'
        ? state.seats[seat].ex
        : state.seats[seat].hand;
  const out: { source: CardId; ability: StaticAbility }[] = [];
  for (const id of ids) {
    if (zone === 'field') {
      const field = state.seats[seat].field.find((card) => card.id === id);
      if (field && isBoxed(field, state.turn)) continue;
    }
    const def = definitionOf(state, id);
    const script = state.scripts[def.id];
    if (!script) continue;
    for (const ability of script.abilities) {
      if (ability.kind !== 'static') continue;
      if (!ability.validIn.includes(zone)) continue;
      if (ability.activeIs === 'controller' && state.active !== seat) continue;
      out.push({ source: id, ability });
    }
  }
  return out;
}

/** Every static currently in force, in the order their sources entered their zones (10.9.3). */
export function activeStatics(
  state: MatchState,
): readonly { readonly source: CardId; readonly seat: Seat; readonly ability: StaticAbility }[] {
  const out: { source: CardId; seat: Seat; ability: StaticAbility }[] = [];
  for (const seat of SEATS) {
    for (const zone of ['field', 'ex', 'hand'] as const) {
      for (const entry of staticsInZone(state, seat, zone)) {
        out.push({ ...entry, seat });
      }
    }
  }
  return out;
}

function staticLive(
  state: MatchState,
  entry: { readonly source: CardId; readonly seat: Seat; readonly ability: StaticAbility },
): boolean {
  if (
    entry.ability.activeIf &&
    !evaluateCondition(state, entry.seat, entry.ability.activeIf, {}, entry.source)
  ) {
    return false;
  }
  return true;
}

export function applyStaticGrants(
  state: MatchState,
  card: FieldCard,
  seat: Seat,
  base: ShownStats,
): ShownStats {
  const keywords = new Set<Keyword>(base.keywords);
  let attack = base.attack;
  let defense = base.defense;
  // 10.9.1: ability/keyword grants (layer) apply before numeric modifications.
  for (const entry of activeStatics(state)) {
    if (!staticLive(state, entry)) continue;
    const grant = entry.ability.grant;
    if (!grant?.keywords) continue;
    if (!matchesFilter(state, card.id, grant.filter, entry.source)) continue;
    void seat;
    for (const keyword of grant.keywords) keywords.add(keyword);
  }
  for (const entry of activeStatics(state)) {
    if (!staticLive(state, entry)) continue;
    const grant = entry.ability.grant;
    if (!grant) continue;
    if (!matchesFilter(state, card.id, grant.filter, entry.source)) continue;
    attack += grant.attack ?? 0;
    defense += grant.defense ?? 0;
  }
  if (keywords.has('drain')) {
    // 12.13.3: Drain does not stack; a Set already de-duplicates.
  }
  return { attack, defense, keywords: [...keywords] };
}

function grantApplies(
  state: MatchState,
  card: CardId,
  entry: { readonly source: CardId; readonly ability: StaticAbility },
): boolean {
  const grant = entry.ability.grant;
  if (!grant) return entry.source === card;
  return matchesFilter(state, card, grant.filter, entry.source);
}

/** Whether a restriction on a static currently covers this card (10.9 non-numeric layer). */
export function hasRestriction(
  state: MatchState,
  card: CardId,
  pred: (restriction: Restriction) => boolean,
): boolean {
  for (const entry of activeStatics(state)) {
    if (!staticLive(state, entry)) continue;
    const restriction = entry.ability.restriction;
    if (!restriction || !pred(restriction)) continue;
    if (!grantApplies(state, card, entry)) continue;
    return true;
  }
  return false;
}

export function controllerHasRestriction(
  state: MatchState,
  seat: Seat,
  pred: (restriction: Restriction) => boolean,
): boolean {
  return state.seats[seat].field.some((card) => hasRestriction(state, card.id, pred));
}

export function wouldBeReplaced(
  state: MatchState,
  card: CardId,
  would: Replacement['would'],
): boolean {
  for (const entry of activeStatics(state)) {
    if (!staticLive(state, entry)) continue;
    const replacement = entry.ability.replacement;
    if (replacement?.would !== would || replacement.instead !== 'prevent') continue;
    if (!grantApplies(state, card, entry) && entry.source !== card) continue;
    return true;
  }
  return false;
}

/** The "next card you play costs N less" offers that currently apply to this card. */
export function playDiscountsFor(state: MatchState, card: CardId): readonly PlayDiscount[] {
  const owner = state.cards[card]?.owner;
  if (owner === undefined) return [];
  return state.playDiscounts.filter(
    (offer) => offer.seat === owner && matchesFilter(state, card, offer.filter, offer.source),
  );
}

/**
 * Cost statics on the card being played still apply after it has moved to resolution. Payment
 * happens there, and the reduction was printed on the card in hand or the EX area.
 */
function costStatics(state: MatchState, card: CardId) {
  const live = activeStatics(state);
  if (locate(state, card)?.zone !== 'resolution') return live;
  const owner = state.cards[card]?.owner;
  const script = state.scripts[definitionOf(state, card).id];
  if (owner === undefined || !script) return live;
  const own = script.abilities.flatMap((ability) => {
    if (ability.kind !== 'static' || (!ability.costDelta && !ability.costIf)) return [];
    if (!ability.validIn.some((zone) => zone === 'hand' || zone === 'ex')) return [];
    return [{ source: card, seat: owner, ability }];
  });
  return [...live, ...own];
}

export function staticPlayCost(state: MatchState, card: CardId): number {
  const def = definitionOf(state, card);
  let cost = def.cost;
  const owner = state.cards[card]?.owner;
  if (owner === undefined) return Math.max(0, cost);
  const statics = costStatics(state, card);

  for (const entry of statics) {
    if (entry.seat !== owner) continue;
    if (!staticLive(state, entry)) continue;
    const { ability } = entry;
    if (ability.costIf && evaluateCondition(state, owner, ability.costIf.cond, {}, card)) {
      cost = ability.costIf.amount;
    }
  }
  for (const entry of statics) {
    if (entry.seat !== owner) continue;
    if (!staticLive(state, entry)) continue;
    const delta = entry.ability.costDelta;
    if (!delta) continue;
    if (!matchesFilter(state, card, delta.filter, entry.source)) continue;
    if (delta.if && !evaluateCondition(state, owner, delta.if, {}, card)) continue;
    if (delta.nthSpell !== undefined) {
      if (def.kind !== 'spell') continue;
      const matching = state.seats[owner].flags.playedThisTurn.filter((id) =>
        matchesFilter(state, id, delta.filter, entry.source),
      );
      if (matching.length + 1 !== delta.nthSpell) continue;
    }
    cost += evaluateValue(state, owner, delta.amount, {}, entry.source);
  }
  const thisTurn = state.costDeltas[card] ?? [];
  cost += thisTurn.reduce((sum, entry) => sum + entry.amount, 0);
  cost += playDiscountsFor(state, card).reduce((sum, offer) => sum + offer.amount, 0);
  return Math.max(0, cost);
}

export function playRestricted(state: MatchState, seat: Seat, card: CardId): boolean {
  const def = definitionOf(state, card);
  const script = state.scripts[def.id];
  if (!script) return false;
  for (const ability of script.abilities) {
    if (ability.kind !== 'static' || !ability.playRestriction) continue;
    if (!evaluateCondition(state, seat, ability.playRestriction, {}, card)) return true;
  }
  return false;
}

/** Printed evolve cost plus this follower's `evolveCostDelta` statics. */
export function evolvePlayCost(state: MatchState, card: CardId): number | null {
  const printed = parseEvolveCost(definitionOf(state, card).text);
  if (printed === null) return null;
  const owner = state.cards[card]?.owner;
  if (owner === undefined) return printed;
  let cost = printed;
  for (const entry of activeStatics(state)) {
    if (entry.seat !== owner) continue;
    if (!staticLive(state, entry)) continue;
    if (entry.source !== card) continue;
    const delta = entry.ability.evolveCostDelta;
    if (delta === undefined) continue;
    cost += evaluateValue(state, owner, delta, {}, card);
  }
  return Math.max(0, cost);
}

/** Replacement and static damage modifiers (10.10, 10.9). */
export function modifiedDamage(
  state: MatchState,
  args: {
    readonly source: CardId | null;
    readonly target: CardId | 'leader';
    readonly targetSeat: Seat;
    readonly amount: number;
    readonly combat: boolean;
  },
): number {
  let amount = args.amount;
  for (const entry of activeStatics(state)) {
    if (!staticLive(state, entry)) continue;
    const { ability } = entry;
    if (ability.damageDealtDelta && args.source) {
      if (
        matchesFilter(state, args.source, { self: true }, entry.source) ||
        entry.source === args.source
      ) {
        amount += ability.damageDealtDelta;
      }
    }
    if (ability.damageTakenDelta && args.target !== 'leader') {
      if (
        matchesFilter(state, args.target, ability.grant?.filter ?? { self: true }, entry.source)
      ) {
        amount += ability.damageTakenDelta;
      }
    }
    const replacement = ability.replacement;
    if (replacement?.would === 'takeDamage') {
      const applies =
        args.target !== 'leader'
          ? matchesFilter(
              state,
              args.target,
              ability.grant?.filter ?? { self: true },
              entry.source,
            ) || args.target === entry.source
          : ability.grant === undefined;
      if (!applies) continue;
      if (replacement.instead === 'prevent') return 0;
      if (replacement.instead === 'modify' && replacement.amount !== undefined) {
        const next = evaluateValue(state, entry.seat, replacement.amount, {}, entry.source);
        amount = replacement.cap ? Math.min(amount, next) : next;
      }
    }
  }
  return Math.max(0, amount);
}
