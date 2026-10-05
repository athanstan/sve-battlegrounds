import type { EngineEvent } from '../events/events';
import { opponentOf, type CardId, type Seat } from '../model/ids';
import {
  definitionOf,
  effectiveDefinition,
  isBoxed,
  type MatchState,
  type PendingAbility,
} from '../state/state';
import type { Trigger, TriggeredAbility } from './spec';
import { matchesFilter } from './filters';
import { evaluateCondition } from './values';
import type { Transcript } from '../engine/transcript';
import { locate } from '../state/zones';
import { fieldOf } from '../engine/derived';

function abilitiesOn(
  state: MatchState,
  defId: PendingAbility['sourceDef'],
): readonly TriggeredAbility[] {
  const script = state.scripts[defId];
  if (!script) return [];
  return script.abilities.filter(
    (ability): ability is TriggeredAbility => ability.kind === 'triggered',
  );
}

function controllerOf(state: MatchState, id: CardId): Seat | null {
  return state.cards[id]?.owner ?? null;
}

function onField(state: MatchState, id: CardId): boolean {
  const found = locate(state, id);
  return found?.zone === 'field';
}

function inEx(state: MatchState, id: CardId): boolean {
  const found = locate(state, id);
  return found?.zone === 'ex';
}

function validHere(state: MatchState, source: CardId, ability: TriggeredAbility): boolean {
  const script = state.scripts[state.cards[source]?.def ?? ('' as PendingAbility['sourceDef'])];
  const statics = script?.abilities.filter((entry) => entry.kind === 'static') ?? [];
  const widen = statics.flatMap((entry) => (entry.kind === 'static' ? entry.validIn : []));
  if (onField(state, source)) return true;
  if (widen.includes('ex') && inEx(state, source)) return true;
  if (widen.includes('hand')) {
    const found = locate(state, source);
    if (found?.zone === 'hand') return true;
  }
  // Last Words and zone-shift triggers fire from last-known info even after leaving (10.7.4, 10.7.7).
  if (ability.on === 'lastWords') return true;
  return false;
}

function matchesTrigger(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  on: Trigger,
): boolean {
  switch (event.type) {
    case 'timingReached': {
      if (typeof on !== 'object' || !('at' in on)) return false;
      if (on.at !== event.point) return false;
      if (on.whose === 'each') return true;
      if (on.whose === 'yours') return event.seat === controller;
      return event.seat !== controller;
    }
    case 'cardPlayed': {
      if (typeof on !== 'object' || !('youPlaySpell' in on)) return false;
      if (event.seat !== controller) return false;
      const def = definitionOf(state, event.card);
      if (def.kind !== 'spell') return false;
      const nth = on.youPlaySpell.nth;
      if (nth !== undefined && state.seats[controller].flags.spellsPlayed !== nth) return false;
      return true;
    }
    case 'followerEvolved': {
      if (event.seat !== controller) return false;
      if (on === 'onEvolve' && event.fieldCard === source) return true;
      if (on === 'onSuperEvolve' && event.superEvolved && event.fieldCard === source) return true;
      if (typeof on === 'object' && 'followerOnYourFieldEvolves' in on) return true;
      return false;
    }
    case 'followerRaced':
      return on === 'onRace' && event.fieldCard === source && event.seat === controller;
    case 'attackDeclared':
      return on === 'strike' && event.attacker === source;
    case 'tokenCreated': {
      if (typeof on !== 'object' || !('tokenEntersYourField' in on)) return false;
      if (event.seat !== controller || event.zone !== 'field') return false;
      return event.cards.some((ref) =>
        matchesFilter(state, ref.id, on.tokenEntersYourField, source),
      );
    }
    case 'cardsMoved': {
      if (on === 'lastWords') {
        if (event.from.zone !== 'field') return false;
        return event.cards.includes(source);
      }
      if (typeof on === 'object' && 'tokenEntersYourField' in on) {
        if (event.to.zone !== 'field' || event.to.seat !== controller) return false;
        return event.cards.some(
          (id) =>
            Boolean(state.cards[id]?.token) &&
            matchesFilter(state, id, on.tokenEntersYourField, source),
        );
      }
      if (typeof on === 'object' && 'enemyDamagedByYouLeavesField' in on) {
        if (event.from.zone !== 'field') return false;
        const enemy = opponentOf(controller);
        if (event.from.seat !== enemy) return false;
        return event.cards.some((id) => {
          if (!matchesFilter(state, id, on.enemyDamagedByYouLeavesField, source)) return false;
          const sources = state.cards[id]?.damagedThisTurnBy ?? [];
          return sources.some((dealer) => {
            if (state.cards[dealer]?.owner !== controller) return false;
            if (!on.fromSource) return true;
            return matchesFilter(state, dealer, on.fromSource, source);
          });
        });
      }
      return false;
    }
    case 'instanceBuffed': {
      if (typeof on !== 'object' || !('gainsAttackOrDefense' in on)) return false;
      if (event.card !== source) return false;
      const attack = event.modifier?.attack ?? 0;
      const defense = event.modifier?.defense ?? 0;
      return attack !== 0 || defense !== 0;
    }
    default: {
      if (typeof on === 'object' && 'whenever' in on) {
        return matchesPattern(state, event, controller, source, on.whenever);
      }
      return false;
    }
  }
}

function matchesPattern(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  pattern: Extract<Trigger, { whenever: unknown }>['whenever'],
): boolean {
  if (pattern.self) {
    const involved =
      ('card' in event && event.card === source) ||
      ('cards' in event && Array.isArray(event.cards) && event.cards.includes(source)) ||
      ('fieldCard' in event && event.fieldCard === source) ||
      ('attacker' in event && event.attacker === source);
    if (!involved) return false;
  }
  switch (pattern.type) {
    case 'played':
      if (event.type !== 'cardPlayed' || event.seat !== controller) return false;
      if (pattern.filter && !matchesFilter(state, event.card, pattern.filter, source)) return false;
      return true;
    case 'moved':
      return movedMatches(state, event, controller, source, pattern);
    case 'damaged':
      return event.type === 'damageDealt';
    case 'destroyed':
      return event.type === 'cardsMoved' && event.cause === 'destroy';
    case 'evolved':
      return event.type === 'followerEvolved' && event.seat === controller;
    case 'attacked':
      return event.type === 'attackDeclared' && event.seat === controller;
    case 'engaged':
      return event.type === 'wardsEngaged' && event.cards.includes(source);
    case 'statGained':
      return event.type === 'instanceBuffed' && event.card === source;
    case 'ubExecuted':
      return event.type === 'abilityResolved' && state.seats[controller].flags.ubExecuted > 0;
    case 'drive':
      return event.type === 'attackEnded';
    case 'fused':
      return event.type === 'flagsChanged' && event.flags.fusedThisTurn > 0;
    case 'leaderDefense':
      return event.type === 'leaderDefenseChanged' && event.seat === controller;
    case 'drew':
      return event.type === 'cardsDrawn' && event.seat === controller;
    case 'timing':
      return (
        event.type === 'timingReached' &&
        (pattern.at === undefined || event.point === pattern.at) &&
        (pattern.whose === 'each' ||
          (pattern.whose === 'yours' && event.seat === controller) ||
          (pattern.whose === 'opponents' && event.seat !== controller) ||
          pattern.whose === undefined)
      );
    case 'state':
      return event.type === 'leaderDefenseChanged' && event.defense <= 0;
  }
}

function movedMatches(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  pattern: Extract<Trigger, { whenever: unknown }>['whenever'],
): boolean {
  if (event.type === 'cardsDiscarded') {
    if (pattern.cause && pattern.cause !== 'discard') return false;
    if (pattern.self && !event.cards.includes(source)) return false;
    if (pattern.by && (!event.by || !matchesFilter(state, event.by, pattern.by, source))) {
      return false;
    }
    const ids = pattern.filter
      ? event.cards.filter((id) => matchesFilter(state, id, pattern.filter, source))
      : event.cards;
    return ids.length > 0;
  }
  if (event.type === 'tokenCreated') {
    if (event.zone !== 'field') return false;
    if (pattern.to && pattern.to.zone !== 'field') return false;
    if (pattern.to?.who === 'you' && event.seat !== controller) return false;
    if (pattern.to?.who === 'opponent' && event.seat === controller) return false;
    if (pattern.cause) return false;
    const ids = event.cards.map((ref) => ref.id);
    const matching = pattern.filter
      ? ids.filter((id) => matchesFilter(state, id, pattern.filter, source))
      : ids;
    return matching.length > 0;
  }
  if (event.type !== 'cardsMoved') return false;
  if (pattern.cause && event.cause !== pattern.cause) return false;
  if (pattern.to && event.to.zone !== pattern.to.zone) return false;
  if (pattern.to?.who === 'you' && event.to.zone !== 'resolution' && event.to.seat !== controller) {
    return false;
  }
  if (
    pattern.to?.who === 'opponent' &&
    event.to.zone !== 'resolution' &&
    event.to.seat === controller
  ) {
    return false;
  }
  if (pattern.from && event.from.zone !== pattern.from.zone) return false;
  if (pattern.self && !event.cards.includes(source)) return false;
  if (pattern.by) return false;
  const ids = pattern.filter
    ? event.cards.filter((id) => matchesFilter(state, id, pattern.filter, source))
    : event.cards;
  return ids.length > 0;
}

function entrantsOf(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  on: Trigger,
): CardId[] {
  if (typeof on !== 'object' || !('whenever' in on)) return [];
  const pattern = on.whenever;
  if (pattern.type !== 'moved' || pattern.self || pattern.to?.zone !== 'field') return [];
  if (!movedMatches(state, event, controller, source, pattern)) return [];
  if (event.type === 'tokenCreated') {
    return event.cards
      .map((ref) => ref.id)
      .filter((id) => !pattern.filter || matchesFilter(state, id, pattern.filter, source));
  }
  if (event.type === 'cardsMoved' && event.from.zone !== 'field') {
    return event.cards.filter(
      (id) => !pattern.filter || matchesFilter(state, id, pattern.filter, source),
    );
  }
  return [];
}

function fieldSources(state: MatchState): { id: CardId; seat: Seat }[] {
  const out: { id: CardId; seat: Seat }[] = [];
  for (const seat of [0, 1] as const) {
    for (const card of state.seats[seat].field) out.push({ id: card.id, seat });
    for (const id of state.seats[seat].ex) out.push({ id, seat });
  }
  return out;
}

function occurrenceCount(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  on: Trigger,
): number {
  if (event.type === 'tokenCreated' && typeof on === 'object' && 'tokenEntersYourField' in on) {
    if (event.seat !== controller || event.zone !== 'field') return 0;
    return event.cards.filter((ref) =>
      matchesFilter(state, ref.id, on.tokenEntersYourField, source),
    ).length;
  }
  if (event.type === 'cardsMoved' && typeof on === 'object' && 'tokenEntersYourField' in on) {
    if (event.to.zone !== 'field' || event.to.seat !== controller) return 0;
    return event.cards.filter(
      (id) =>
        Boolean(state.cards[id]?.token) &&
        matchesFilter(state, id, on.tokenEntersYourField, source),
    ).length;
  }
  return matchesTrigger(state, event, controller, source, on) ? 1 : 0;
}

function enteredCards(
  state: MatchState,
  event: EngineEvent,
  controller: Seat,
  source: CardId,
  on: Trigger,
): CardId[] {
  const entrants = entrantsOf(state, event, controller, source, on);
  if (entrants.length > 0) return entrants;
  if (typeof on !== 'object' || !('tokenEntersYourField' in on)) return [];
  if (event.type === 'tokenCreated') {
    if (event.seat !== controller || event.zone !== 'field') return [];
    return event.cards
      .map((ref) => ref.id)
      .filter((id) => matchesFilter(state, id, on.tokenEntersYourField, source));
  }
  if (event.type === 'cardsMoved') {
    if (event.to.zone !== 'field' || event.to.seat !== controller) return [];
    return event.cards.filter(
      (id) =>
        Boolean(state.cards[id]?.token) &&
        matchesFilter(state, id, on.tokenEntersYourField, source),
    );
  }
  return [];
}

function enqueue(
  t: Transcript,
  seat: Seat,
  source: CardId,
  sourceDef: PendingAbility['sourceDef'],
  ability: TriggeredAbility,
  event: EngineEvent,
): void {
  if (ability.condition && !evaluateCondition(t.state, seat, ability.condition, {}, source)) {
    return;
  }
  const entered = enteredCards(t.state, event, seat, source, ability.on);
  if (entered.length > 0) {
    for (const id of entered) {
      if (capReached(t.state, seat, ability)) break;
      t.emit({
        type: 'abilityPending',
        id: t.state.nextPendingId,
        seat,
        source,
        sourceDef,
        abilityKey: ability.key,
        triggerSeq: t.state.seq,
        vars: { entered: [id] },
      });
    }
    return;
  }
  const hits = occurrenceCount(t.state, event, seat, source, ability.on);
  for (let n = 0; n < hits; n++) {
    if (capReached(t.state, seat, ability)) break; // 10.7.2.2
    t.emit({
      type: 'abilityPending',
      id: t.state.nextPendingId,
      seat,
      source,
      sourceDef,
      abilityKey: ability.key,
      triggerSeq: t.state.seq,
    });
  }
}

function capReached(state: MatchState, seat: Seat, ability: TriggeredAbility): boolean {
  if (ability.perTurn === undefined) return false;
  const used = state.seats[seat].flags.pendingCounts[ability.key] ?? 0;
  return used >= ability.perTurn;
}

/** Scan one event into the pending pool (10.7). Per-turn caps apply here, not at resolution (10.7.2.2). */
export function scanTriggers(t: Transcript, event: EngineEvent): void {
  if (event.type === 'abilityPending' || event.type === 'abilityResolved') return;
  const { state } = t;

  if (event.type === 'timingReached') {
    for (const delayed of state.delayed) {
      if (delayed.point !== event.point) continue;
      const yours = delayed.seat === event.seat;
      if (delayed.whose === 'yours' && !yours) continue;
      if (delayed.whose === 'opponents' && yours) continue;
      t.emit({
        type: 'abilityPending',
        id: t.state.nextPendingId,
        seat: delayed.seat,
        source: delayed.source,
        sourceDef: delayed.sourceDef,
        abilityKey: `delayed:${delayed.id}`,
        triggerSeq: t.state.seq,
      });
    }
  }

  const arrived =
    event.type === 'cardsMoved'
      ? event.cards.map((id) => ({
          id,
          seat:
            event.from.zone === 'field'
              ? event.from.seat
              : (controllerOf(t.state, id) ?? (event.to.zone === 'resolution' ? 0 : event.to.seat)),
        }))
      : event.type === 'cardsDiscarded'
        ? event.cards.map((id) => ({ id, seat: event.seat }))
        : event.type === 'tokenCreated'
          ? event.cards.map((ref) => ({ id: ref.id, seat: event.seat }))
          : [];
  const sources = [...fieldSources(t.state), ...arrived];

  const seen = new Set<string>();
  for (const { id, seat } of sources) {
    const key = `${seat}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const printed = t.state.cards[id]?.def;
    if (!printed) continue;
    const loc = fieldOf(t.state, id);
    if (loc && isBoxed(loc.card, t.state.turn)) continue;
    // Last-known effective definition at scan time (10.7.4.1, 10.11).
    const effective = effectiveDefinition(t.state, id);
    const sourceDef = effective.id;
    for (const ability of abilitiesOn(t.state, sourceDef)) {
      const selfMove =
        typeof ability.on === 'object' &&
        'whenever' in ability.on &&
        ability.on.whenever.self === true;
      if (
        !validHere(t.state, id, ability) &&
        ability.on !== 'lastWords' &&
        ability.on !== 'fanfare' &&
        !selfMove
      ) {
        continue;
      }
      if (ability.on === 'fanfare') {
        if (
          event.type === 'cardsMoved' &&
          event.to.zone === 'field' &&
          event.from.zone !== 'field' &&
          event.cards.includes(id) &&
          (event.cause === 'search' ||
            event.cause === 'effect' ||
            event.cause === 'summon' ||
            event.cause === 'look' ||
            event.cause === 'token')
        ) {
          if (!capReached(t.state, seat, ability)) {
            t.emit({
              type: 'abilityPending',
              id: t.state.nextPendingId,
              seat,
              source: id,
              sourceDef,
              abilityKey: ability.key,
              triggerSeq: t.state.seq,
              vars: { __from: event.from.zone },
            });
          }
        }
        continue;
      }
      enqueue(t, seat, id, sourceDef, ability, event);
    }
    const granted = loc?.card.grantedAbilities ?? [];
    for (const grant of granted) {
      if (grant.ability.kind !== 'triggered') continue;
      enqueue(t, seat, id, sourceDef, grant.ability, event);
    }
    // Also scan the printed (unevolved) script when it differs, so a base-side trigger still fires.
    if (printed !== sourceDef) {
      for (const ability of abilitiesOn(t.state, printed)) {
        if (ability.on === 'fanfare' || ability.on === 'lastWords') continue;
        enqueue(t, seat, id, printed, ability, event);
      }
    }
  }
}

/** State-trigger hook (10.7.6): leader defense 0 or less re-arms `whenever: { type: 'state' }`. */
export function scanStateTriggers(t: Transcript): void {
  for (const { id, seat } of fieldSources(t.state)) {
    if (t.state.seats[seat].leader.defense > 0) continue;
    const loc = fieldOf(t.state, id);
    if (loc && isBoxed(loc.card, t.state.turn)) continue;
    const printed = t.state.cards[id]?.def;
    if (!printed) continue;
    const sourceDef = effectiveDefinition(t.state, id).id;
    const granted = (loc?.card.grantedAbilities ?? [])
      .map((grant) => grant.ability)
      .filter((ability): ability is TriggeredAbility => ability.kind === 'triggered');
    for (const ability of [...abilitiesOn(t.state, sourceDef), ...granted]) {
      if (typeof ability.on !== 'object' || !('whenever' in ability.on)) continue;
      if (ability.on.whenever.type !== 'state') continue;
      if (capReached(t.state, seat, ability)) continue;
      t.emit({
        type: 'abilityPending',
        id: t.state.nextPendingId,
        seat,
        source: id,
        sourceDef,
        abilityKey: ability.key,
        triggerSeq: t.state.seq,
      });
    }
  }
}
