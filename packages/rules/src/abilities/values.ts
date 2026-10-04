import type { Condition, ResourceQuery, Value } from './spec';
import { definitionOf, effectiveDefinition, type MatchState } from '../state/state';
import { opponentOf, type CardId, type Seat } from '../model/ids';
import { asCardIds, gather, matchesFilter } from './filters';

function whoSeat(controller: Seat, who: 'you' | 'opponent' | 'any' | undefined): Seat {
  if (who === 'opponent') return opponentOf(controller);
  return controller;
}

function attrOf(
  state: MatchState,
  id: CardId,
  attr: 'cost' | 'attack' | 'defense' | 'baseCost',
): number {
  const printed = definitionOf(state, id);
  const def = effectiveDefinition(state, id);
  if (attr === 'cost' || attr === 'baseCost') return printed.cost;
  for (const seat of [0, 1] as const) {
    const field = state.seats[seat].field.find((card) => card.id === id);
    if (field) return attr === 'attack' ? field.shown.attack : field.shown.defense;
  }
  const known = state.cards[id]?.lastKnown;
  if (known) return attr === 'attack' ? known.attack : known.defense;
  return attr === 'attack' ? (def.attack ?? 0) : (def.defense ?? 0);
}

function resourceOf(state: MatchState, seat: Seat, query: ResourceQuery): number {
  const s = state.seats[seat];
  switch (query) {
    case 'playPoints':
      return s.resources.playPoints;
    case 'maxPlayPoints':
      return s.resources.maxPlayPoints;
    case 'evolutionPoints':
      return s.resources.evolutionPoints;
    case 'superEvolutionPoints':
      return s.resources.superEvolutionPoints;
    case 'hand':
      return s.hand.length;
    case 'deck':
      return s.deck.length;
    case 'ex':
      return s.ex.length;
    case 'cemetery':
      return s.cemetery.length;
    case 'banished':
      return s.banished.length;
  }
}

function countersOn(state: MatchState, id: CardId, name: string): number {
  for (const seat of [0, 1] as const) {
    const field = state.seats[seat].field.find((card) => card.id === id);
    if (field) return field.counters[name] ?? 0;
  }
  return 0;
}

function hasStack(state: MatchState, seat: Seat): boolean {
  return state.seats[seat].field.some((card) => {
    const def = definitionOf(state, card.id);
    return def.keywords.includes('stack') || (card.counters.stack ?? 0) > 0;
  });
}

export function evaluateValue(
  state: MatchState,
  controller: Seat,
  value: Value,
  vars: Readonly<Record<string, unknown>>,
  self?: CardId,
): number {
  if (typeof value === 'number') return value;
  if ('var' in value) {
    const stored = vars[value.var];
    if (typeof stored === 'number') return stored;
    if (Array.isArray(stored)) return stored.length;
    return 0;
  }
  if ('count' in value) {
    const n = gather(state, controller, [value.count], value.filter, self).length;
    return n * (value.times ?? 1);
  }
  if ('forEvery' in value) {
    const total = evaluateValue(state, controller, value.of, vars, self);
    return Math.floor(total / value.forEvery) * value.each;
  }
  if ('half' in value) {
    return Math.ceil(evaluateValue(state, controller, value.half, vars, self) / 2);
  }
  if ('sum' in value) {
    return value.sum.reduce<number>(
      (total, part) => total + evaluateValue(state, controller, part, vars, self),
      0,
    );
  }
  if ('attr' in value) {
    const id = value.of === 'self' ? self : asCardIds(vars, value.of)[0];
    return id ? attrOf(state, id, value.attr) : 0;
  }
  if ('resource' in value) {
    return resourceOf(state, whoSeat(controller, value.who), value.resource);
  }
  if ('tally' in value) {
    const flags = state.seats[controller].flags;
    switch (value.tally) {
      case 'cardsPlayed':
        return flags.cardsPlayed;
      case 'spellsPlayed':
        return flags.spellsPlayed;
      case 'leaderLostDefense':
        return flags.leaderLostDefense;
      case 'followersAttacked':
        return flags.followersAttacked;
      case 'ubExecuted':
        return flags.ubExecuted;
      case 'cardsPlayedExcludingSelf':
        return Math.max(0, flags.cardsPlayed - 1);
    }
  }
  if ('counters' in value) {
    const id = value.on === undefined || value.on === 'self' ? self : asCardIds(vars, value.on)[0];
    return id ? countersOn(state, id, value.counters) : 0;
  }
  if ('minus' in value) {
    return Math.max(
      0,
      evaluateValue(state, controller, value.minus[0], vars, self) -
        evaluateValue(state, controller, value.minus[1], vars, self),
    );
  }
  if ('times' in value) {
    return (
      evaluateValue(state, controller, value.times[0], vars, self) *
      evaluateValue(state, controller, value.times[1], vars, self)
    );
  }
  if ('min' in value) {
    return Math.min(...value.min.map((part) => evaluateValue(state, controller, part, vars, self)));
  }
  if ('max' in value) {
    return Math.max(...value.max.map((part) => evaluateValue(state, controller, part, vars, self)));
  }
  if ('result' in value) {
    const stored = vars[value.result];
    if (typeof stored === 'number') return stored;
    if (Array.isArray(stored)) return stored.length;
    return 0;
  }
  return 0;
}

export function evaluateCondition(
  state: MatchState,
  controller: Seat,
  cond: Condition,
  vars: Readonly<Record<string, unknown>>,
  self?: CardId,
): boolean {
  if ('atLeast' in cond) {
    return evaluateValue(state, controller, cond.value, vars, self) >= cond.atLeast;
  }
  if ('atMost' in cond) {
    return evaluateValue(state, controller, cond.value, vars, self) <= cond.atMost;
  }
  if ('combo' in cond) {
    return state.seats[controller].flags.cardsPlayed >= cond.combo;
  }
  if ('exists' in cond) {
    return gather(state, controller, [cond.exists], cond.filter, self).length > 0;
  }
  if ('all' in cond) {
    return cond.all.every((part) => evaluateCondition(state, controller, part, vars, self));
  }
  if ('any' in cond) {
    return cond.any.some((part) => evaluateCondition(state, controller, part, vars, self));
  }
  if ('not' in cond) {
    return !evaluateCondition(state, controller, cond.not, vars, self);
  }
  if ('sameCost' in cond) {
    const ids = asCardIds(vars, cond.sameCost);
    if (ids.length < 2) return false;
    const costs = ids.map((id) => definitionOf(state, id).cost);
    return costs.every((cost) => cost === costs[0]);
  }
  if ('yourTurn' in cond) {
    return state.active === controller;
  }
  if ('matches' in cond) {
    const ids = asCardIds(vars, cond.matches);
    return ids.length > 0 && ids.every((id) => matchesFilter(state, id, cond.filter, self));
  }
  if ('overflow' in cond) {
    return state.seats[controller].resources.maxPlayPoints >= 7;
  }
  if ('sanguine' in cond) {
    return state.seats[controller].flags.leaderLostDefense > 0;
  }
  if ('necrocharge' in cond) {
    return state.seats[controller].cemetery.length >= cond.necrocharge;
  }
  if ('spellchain' in cond) {
    return state.seats[controller].flags.spellsPlayed >= cond.spellchain;
  }
  if ('earthRite' in cond) {
    return hasStack(state, controller);
  }
  if ('stack' in cond) {
    return hasStack(state, controller);
  }
  if ('lesson' in cond) {
    const items = state.seats[controller].ex.filter((id) => {
      const def = definitionOf(state, id);
      return def.name.toLowerCase().includes('magical item') || def.traits.includes('Magical Item');
    }).length;
    return items >= cond.lesson;
  }
  if ('leaderClass' in cond) {
    const leader = definitionOf(state, state.seats[controller].leader.card);
    return leader.cardClass === cond.leaderClass;
  }
  if ('did' in cond) {
    const stored = vars[cond.did];
    if (typeof stored === 'number') return stored > 0;
    if (Array.isArray(stored)) return stored.length > 0;
    return Boolean(stored);
  }
  if ('equal' in cond) {
    return (
      evaluateValue(state, controller, cond.equal[0], vars, self) ===
      evaluateValue(state, controller, cond.equal[1], vars, self)
    );
  }
  if ('superEvolutionPointsAtMost' in cond) {
    return (
      state.seats[controller].resources.superEvolutionPoints <= cond.superEvolutionPointsAtMost
    );
  }
  if ('die' in cond) {
    const rolled = vars.__die;
    if (typeof rolled !== 'number') return false;
    if (cond.die.is !== undefined) return rolled === cond.die.is;
    if (cond.die.atLeast !== undefined && rolled < cond.die.atLeast) return false;
    if (cond.die.atMost !== undefined && rolled > cond.die.atMost) return false;
    return true;
  }
  return false;
}
