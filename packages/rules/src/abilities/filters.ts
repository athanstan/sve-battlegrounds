import type { CardFilter, Place, Who } from './spec';
import {
  definitionOf,
  effectiveDefinition,
  isBoxed,
  type FieldCard,
  type MatchState,
} from '../state/state';
import { opponentOf, type CardId, type Seat } from '../model/ids';

export function resolveWho(controller: Seat, who: Who): readonly Seat[] {
  if (who === 'you') return [controller];
  if (who === 'opponent') return [opponentOf(controller)];
  return [0, 1];
}

function fieldCardOf(state: MatchState, id: CardId): FieldCard | undefined {
  for (const seat of [0, 1] as const) {
    const card = state.seats[seat].field.find((entry) => entry.id === id);
    if (card) return card;
  }
  return undefined;
}

export function cardsAt(state: MatchState, controller: Seat, place: Place): CardId[] {
  const seats = resolveWho(controller, place.who);
  const ids: CardId[] = [];
  for (const seat of seats) {
    const s = state.seats[seat];
    switch (place.zone) {
      case 'field':
        ids.push(...s.field.map((card) => card.id));
        break;
      case 'ex':
        ids.push(...s.ex);
        break;
      case 'hand':
        ids.push(...s.hand);
        break;
      case 'cemetery':
        ids.push(...s.cemetery);
        break;
      case 'deck':
        ids.push(...s.deck);
        break;
      case 'evolveDeck':
        ids.push(...s.evolveDeck);
        break;
      case 'evolveDeckRevealed':
        ids.push(...s.evolveDeckRevealed);
        break;
      case 'evolveZone':
        ids.push(...s.evolveZone.map((link) => link.card));
        break;
      case 'leader':
        ids.push(s.leader.card);
        break;
      case 'banished':
        ids.push(...s.banished.map((card) => card.id));
        break;
    }
  }
  return ids;
}

export function matchesFilter(
  state: MatchState,
  id: CardId,
  filter?: CardFilter,
  self?: CardId,
): boolean {
  if (!filter) return true;
  const def = effectiveDefinition(state, id);
  const printed = definitionOf(state, id);
  if (filter.kind && !filter.kind.includes(def.kind)) return false;
  if (filter.trait && !def.traits.includes(filter.trait)) return false;
  if (filter.pixie && !def.traits.includes('Pixie')) return false;
  if (filter.universe && def.universe !== filter.universe) return false;
  if (filter.token !== undefined && Boolean(state.cards[id]?.token) !== filter.token) return false;
  if (filter.name) {
    const script = state.scripts[printed.id];
    const aliases = script?.alsoNamed ?? [];
    if (
      def.name !== filter.name &&
      printed.name !== filter.name &&
      !aliases.includes(filter.name)
    ) {
      return false;
    }
  }
  if (filter.cardClass && def.cardClass !== filter.cardClass) return false;
  if (filter.costAtMost !== undefined && printed.cost > filter.costAtMost) return false;
  if (filter.costIs !== undefined && printed.cost !== filter.costIs) return false;
  if (filter.costAtLeast !== undefined && printed.cost < filter.costAtLeast) return false;
  if (filter.other && id === self) return false;
  if (filter.self && id !== self) return false;
  if (filter.evolved) {
    const owner = state.cards[id]?.owner;
    const linked =
      owner !== undefined && state.seats[owner].evolveZone.some((link) => link.linkedTo === id);
    if (!linked && def.special !== 'evolved') return false;
  }
  if (filter.faceUp !== undefined) {
    const owner = state.cards[id]?.owner;
    if (owner === undefined) return false;
    const race = state.seats[owner].raceZone.find((link) => link.card === id);
    if (race) {
      if (Boolean(race.faceUp) !== filter.faceUp) return false;
    } else if (filter.faceUp && !state.seats[owner].evolveDeckRevealed.includes(id)) {
      return false;
    } else if (!filter.faceUp && state.seats[owner].evolveDeckRevealed.includes(id)) {
      return false;
    }
  }
  if (filter.racing) {
    const owner = state.cards[id]?.owner;
    const racing =
      owner !== undefined && state.seats[owner].raceZone.some((link) => link.linkedTo === id);
    if (!racing) return false;
  }
  if (filter.reserved || filter.boxed) {
    const owner = state.cards[id]?.owner;
    const field =
      owner !== undefined ? state.seats[owner].field.find((card) => card.id === id) : undefined;
    if (filter.reserved && field?.placement !== 'reserved') return false;
    if (filter.boxed && (!field || !isBoxed(field, state.turn))) return false;
  }
  if (filter.traits && !filter.traits.some((trait) => def.traits.includes(trait))) return false;
  if (filter.traitsAll && !filter.traitsAll.every((trait) => def.traits.includes(trait))) {
    return false;
  }
  if (filter.traitNot && def.traits.includes(filter.traitNot)) return false;
  if (filter.names && !filter.names.includes(def.name) && !filter.names.includes(printed.name)) {
    return false;
  }
  if (filter.nameNot && (def.name === filter.nameNot || printed.name === filter.nameNot)) {
    return false;
  }
  if (filter.keyword) {
    const shown = fieldCardOf(state, id)?.shown.keywords ?? def.keywords;
    if (!shown.includes(filter.keyword)) return false;
  }
  if (filter.hasCounter) {
    const field = fieldCardOf(state, id);
    if (!field || (field.counters[filter.hasCounter] ?? 0) < 1) return false;
  }
  if (filter.engaged !== undefined) {
    const field = fieldCardOf(state, id);
    if (!field || (field.placement === 'engaged') !== filter.engaged) return false;
  }
  if (filter.damaged !== undefined) {
    const field = fieldCardOf(state, id);
    if (!field || field.damageTaken > 0 !== filter.damaged) return false;
  }
  const shown = fieldCardOf(state, id)?.shown;
  const attack = shown?.attack ?? def.attack ?? 0;
  const defense = shown?.defense ?? def.defense ?? 0;
  if (filter.attackAtLeast !== undefined && attack < filter.attackAtLeast) return false;
  if (filter.attackAtMost !== undefined && attack > filter.attackAtMost) return false;
  if (filter.defenseAtLeast !== undefined && defense < filter.defenseAtLeast) return false;
  if (filter.defenseAtMost !== undefined && defense > filter.defenseAtMost) return false;
  if (filter.crest && def.kind !== 'crest') return false;
  if (filter.equipment && def.kind !== 'equipment') return false;
  if (filter.sameNameAs === 'self' && self) {
    if (def.name !== effectiveDefinition(state, self).name) return false;
  }
  return true;
}

export function gather(
  state: MatchState,
  controller: Seat,
  places: readonly Place[],
  filter: CardFilter | undefined,
  self?: CardId,
): CardId[] {
  const seen = new Set<CardId>();
  const out: CardId[] = [];
  for (const place of places) {
    for (const id of cardsAt(state, controller, place)) {
      if (seen.has(id)) continue;
      if (!matchesFilter(state, id, filter, self)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  if (filter?.highest && out.length > 1) {
    const key = filter.highest;
    const best = Math.max(...out.map((id) => attrOf(state, id, key)));
    return out.filter((id) => attrOf(state, id, key) === best);
  }
  if (filter?.lowest && out.length > 1) {
    const key = filter.lowest;
    const best = Math.min(...out.map((id) => attrOf(state, id, key)));
    return out.filter((id) => attrOf(state, id, key) === best);
  }
  return out;
}

function attrOf(state: MatchState, id: CardId, attr: 'attack' | 'defense' | 'cost'): number {
  const def = definitionOf(state, id);
  if (attr === 'cost') return def.cost;
  const field = fieldCardOf(state, id);
  if (attr === 'attack') return field?.shown.attack ?? def.attack ?? 0;
  return field?.shown.defense ?? def.defense ?? 0;
}

export function countOf(spec: number | { readonly upTo: number } | 'any'): {
  min: number;
  max: number;
} {
  if (spec === 'any') return { min: 0, max: 64 };
  if (typeof spec === 'number') return { min: spec, max: spec };
  return { min: 0, max: spec.upTo };
}

export function asCardIds(vars: Readonly<Record<string, unknown>>, name: string): CardId[] {
  const stored = vars[name];
  if (typeof stored === 'string') return [stored as CardId];
  if (Array.isArray(stored)) return stored.filter((id): id is CardId => typeof id === 'string');
  return [];
}
