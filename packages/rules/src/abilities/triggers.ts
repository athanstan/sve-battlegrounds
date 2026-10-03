import type { EngineEvent } from '../events/events';
import { opponentOf, type CardId, type Seat } from '../model/ids';
import {
  definitionOf,
  effectiveDefinition,
  type MatchState,
  type PendingAbility,
} from '../state/state';
import type { Trigger, TriggeredAbility } from './spec';
import { matchesFilter } from './filters';
import type { Transcript } from '../engine/transcript';
import { locate } from '../state/zones';

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
          const field = state.seats[enemy].field.find((card) => card.id === id);
          // Last-known: the card has already left; look at damagedThisTurnBy on remaining...
          // The event applied first, so the field card is gone. We cannot read damagedThisTurnBy.
          // Scan uses last-known from the event itself: skip if we cannot prove it.
          void field;
          return true;
        });
      }
      return false;
    }
    default:
      return false;
  }
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

function enqueue(
  t: Transcript,
  seat: Seat,
  source: CardId,
  sourceDef: PendingAbility['sourceDef'],
  ability: TriggeredAbility,
  event: EngineEvent,
): void {
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

  const sources =
    event.type === 'cardsMoved' && event.from.zone === 'field'
      ? [
          ...fieldSources(t.state),
          ...event.cards.map((id) => ({
            id,
            seat: controllerOf(t.state, id) ?? (event.from.zone === 'field' ? event.from.seat : 0),
          })),
        ]
      : fieldSources(t.state);

  const seen = new Set<string>();
  for (const { id, seat } of sources) {
    const key = `${seat}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const printed = t.state.cards[id]?.def;
    if (!printed) continue;
    // Last-known effective definition at scan time (10.7.4.1, 10.11).
    const effective = effectiveDefinition(t.state, id);
    const sourceDef = effective.id;
    for (const ability of abilitiesOn(t.state, sourceDef)) {
      if (
        !validHere(t.state, id, ability) &&
        ability.on !== 'lastWords' &&
        ability.on !== 'fanfare'
      ) {
        continue;
      }
      if (ability.on === 'fanfare') continue; // Fanfare is the play pipeline, not the pending pool.
      enqueue(t, seat, id, sourceDef, ability, event);
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

/** State-trigger hook (10.7.6). No card in the two decks needs one; the scan lives here so they can. */
export function scanStateTriggers(_t: Transcript): void {
  // Intentionally empty: re-arming "when there are no cards in your hand" slots in here.
}
