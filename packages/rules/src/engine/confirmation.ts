import type { EngineEvent } from '../events/events';
import { opponentOf, SEATS, type CardId, type Seat } from '../model/ids';
import type { GameOverReason, MatchState, Outcome, PendingAbility } from '../state/state';
import { definitionOf, effectiveDefinition } from '../state/state';
import type { Transcript } from './transcript';
import { moveCards } from './move';
import { hasShownKeyword, refreshDerived } from './derived';
import { hasRestriction, wouldBeReplaced } from '../abilities/statics';
import { isSelection } from './queries';
import { popWork, pushWork } from './stack';
import { scanStateTriggers } from '../abilities/triggers';
import type { PromptRequest } from './steps/step';
import { REJECTED, type AnswerResult } from './steps/step';
import type { Intent } from '../actions/intents';
import type { Prompt } from '../state/state';
import type { Instr } from '../abilities/spec';
import { gather } from '../abilities/filters';

type RuleHandler = (state: MatchState) => readonly EngineEvent[];

const lostBy = (state: MatchState, seat: Seat): GameOverReason | null => {
  const player = state.seats[seat];
  if (player.leader.defense <= 0 && !state.cantLose.includes(seat)) return 'leaderDefeated';
  if (player.drewFromEmptyDeck) return 'deckOut';
  return null;
};

function handleLosses(state: MatchState): readonly EngineEvent[] {
  const seat0 = lostBy(state, 0);
  const seat1 = lostBy(state, 1);

  let outcome: Outcome;
  if (seat0 && seat1) {
    const reason =
      seat0 === 'leaderDefeated' || seat1 === 'leaderDefeated' ? 'leaderDefeated' : 'deckOut';
    outcome = { winner: null, reason };
  } else if (seat0) {
    outcome = { winner: 1, reason: seat0 };
  } else if (seat1) {
    outcome = { winner: 0, reason: seat1 };
  } else {
    return [];
  }
  return [{ type: 'gameEnded', outcome }];
}

function handlePlayPointLimit(state: MatchState): readonly EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const seat of SEATS) {
    const { playPoints, maxPlayPoints } = state.seats[seat].resources;
    if (playPoints > maxPlayPoints) {
      events.push({ type: 'resourceChanged', seat, resource: 'playPoints', value: maxPlayPoints });
    }
  }
  return events;
}

/** 11.3.1: a follower at 0 or less defense is destroyed. */
function handleFollowerDestruction(state: MatchState): readonly EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const seat of SEATS) {
    for (const card of state.seats[seat].field) {
      const def = effectiveDefinition(state, card.id);
      if (def.kind !== 'follower') continue;
      if (card.shown.defense > 0) continue;
      if (hasRestriction(state, card.id, (r) => r.cantBeDestroyed === true)) continue;
      if (wouldBeReplaced(state, card.id, 'destroy')) continue;
      events.push({
        type: 'cardsMoved',
        owner: seat,
        cards: [card.id],
        from: { zone: 'field', seat },
        to: { zone: 'cemetery', seat: state.cards[card.id]?.owner ?? seat },
        cause: 'destroy',
      });
    }
  }
  return events;
}

/** 11.3.2: Bane destroys the follower it fought. */
function handleBane(state: MatchState): readonly EngineEvent[] {
  const events: EngineEvent[] = [];
  const seen = new Set<CardId>();
  const destroy = (id: CardId) => {
    if (seen.has(id)) return;
    const loc = SEATS.map((seat) => ({
      seat,
      card: state.seats[seat].field.find((c) => c.id === id),
    })).find((entry) => entry.card);
    if (!loc?.card) return;
    seen.add(id);
    events.push({
      type: 'cardsMoved',
      owner: loc.seat,
      cards: [id],
      from: { zone: 'field', seat: loc.seat },
      to: { zone: 'cemetery', seat: state.cards[id]?.owner ?? loc.seat },
      cause: 'destroy',
    });
  };
  for (const { a, b } of state.combats) {
    const aBane = hasShownKeyword(state, a, 'bane');
    const bBane = hasShownKeyword(state, b, 'bane');
    if (aBane) destroy(b);
    if (bBane) destroy(a);
  }
  return events;
}

function handleIllegalEvolutions(state: MatchState): readonly EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const seat of SEATS) {
    const fieldIds = new Set(state.seats[seat].field.map((card) => card.id));
    for (const link of state.seats[seat].evolveZone) {
      if (fieldIds.has(link.linkedTo)) continue;
      events.push({
        type: 'cardsMoved',
        owner: seat,
        cards: [link.card],
        from: { zone: 'evolveZone', seat },
        to: { zone: 'evolveDeckRevealed', seat },
        cause: 'rules',
      });
    }
    for (const link of state.seats[seat].raceZone) {
      if (fieldIds.has(link.linkedTo)) continue;
      events.push({
        type: 'cardsMoved',
        owner: seat,
        cards: [link.card],
        from: { zone: 'raceZone', seat },
        to: { zone: 'evolveDeckRevealed', seat },
        cause: 'rules',
      });
    }
  }
  return events;
}

const RULES: readonly RuleHandler[] = [
  handleLosses,
  handlePlayPointLimit,
  handleFollowerDestruction,
  handleBane,
  handleIllegalEvolutions,
];

const MAX_ROUNDS = 100;

function overflowPrompt(state: MatchState): PromptRequest | null {
  for (const seat of SEATS) {
    const field = state.seats[seat].field;
    const keep = state.seats[seat].limits.field;
    if (field.length > keep) {
      return {
        kind: 'keepOnField',
        seat,
        keep,
        candidates: field.map((card) => card.id),
      };
    }
    const ex = state.seats[seat].ex;
    const exKeep = state.seats[seat].limits.ex;
    if (ex.length > exKeep) {
      return { kind: 'keepInEx', seat, keep: exKeep, candidates: ex };
    }
  }
  return null;
}

function pendingLabel(state: MatchState, pending: PendingAbility): string {
  const def = state.defs[pending.sourceDef] ?? definitionOf(state, pending.source);
  return `${def.name}: ${pending.abilityKey}`;
}

function pendingFor(state: MatchState, seat: Seat): readonly PendingAbility[] {
  return state.pending.filter((entry) => entry.seat === seat);
}

function interchangeable(pending: readonly PendingAbility[]): boolean {
  const first = pending[0];
  if (!first) return true;
  return pending.every(
    (entry) => entry.abilityKey === first.abilityKey && entry.sourceDef === first.sourceDef,
  );
}

function requiredTargetsMissing(state: MatchState, pending: PendingAbility): boolean {
  const script = state.scripts[pending.sourceDef];
  const ability = script?.abilities.find((entry) => entry.key === pending.abilityKey);
  const delayed = pending.abilityKey.startsWith('delayed:')
    ? state.delayed.find((entry) => `delayed:${entry.id}` === pending.abilityKey)
    : undefined;
  const effect: readonly Instr[] =
    delayed?.effect ?? (ability && 'effect' in ability ? ability.effect : []);
  for (const instr of effect) {
    if (instr.op !== 'select' || !instr.target || typeof instr.count !== 'number') continue;
    const candidates = gather(state, pending.seat, instr.from, instr.filter, pending.source);
    if (candidates.length < instr.count) return true;
  }
  return false;
}

function playPending(t: Transcript, pending: PendingAbility): void {
  let queue: readonly Instr[] | null = null;
  if (pending.abilityKey.startsWith('delayed:')) {
    const id = Number(pending.abilityKey.slice('delayed:'.length));
    const delayed = t.state.delayed.find((entry) => entry.id === id);
    if (delayed) {
      queue = delayed.effect;
      t.emit({ type: 'delayedConsumed', id: delayed.id });
    }
  }
  t.emit({ type: 'abilityResolved', id: pending.id });
  pushWork(t, {
    kind: 'resolveAbility',
    seat: pending.seat,
    source: pending.source,
    sourceDef: pending.sourceDef,
    abilityKey: pending.abilityKey,
    pc: 0,
    vars: pending.vars ?? {},
    pendingId: pending.id,
    queue,
  });
}

function applyRulesUntilStable(t: Transcript): void {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (t.state.outcome) return;
    const events = RULES.flatMap((rule) => rule(t.state));
    if (events.length === 0) {
      eliminateIllegalTokens(t);
      refreshDerived(t);
      return;
    }
    t.emit(...events);
    eliminateIllegalTokens(t);
    refreshDerived(t);
  }
  t.emit({ type: 'gameEnded', outcome: { winner: null, reason: 'perpetualCycle' } });
}

function needsPlayerConfirmation(state: MatchState): boolean {
  if (state.outcome) return false;
  if (state.pending.length > 0) return true;
  return overflowPrompt(state) !== null;
}

function ensureConfirmation(t: Transcript): void {
  if (t.state.work.some((frame) => frame.kind === 'confirmation')) return;
  pushWork(t, { kind: 'confirmation', round: 0 });
}

/**
 * Confirmation Timing (10.5.2). Rules handling runs immediately. A work frame is only
 * pushed when a player must answer (overflow, pending order) or an ability must resolve.
 */
export function confirmationTiming(t: Transcript): void {
  refreshDerived(t); // 10.9: shown stats must be current before 11.3
  scanStateTriggers(t);
  applyRulesUntilStable(t);
  if (t.state.outcome) return;
  if (!needsPlayerConfirmation(t.state)) return;
  ensureConfirmation(t);
}

export function tickConfirmation(t: Transcript): PromptRequest | null {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (t.state.outcome) {
      popWork(t);
      return null;
    }
    const events = RULES.flatMap((rule) => rule(t.state));
    if (events.length > 0) {
      t.emit(...events);
      eliminateIllegalTokens(t);
      refreshDerived(t);
      continue;
    }
    const overflow = overflowPrompt(t.state);
    if (overflow) return overflow;

    const active = t.state.active;
    // APNAP: the active player answers first, then the opponent (10.5.2).
    const seats: Seat[] = active !== null ? [active, opponentOf(active)] : [0, 1];
    for (const seat of seats) {
      const pool = pendingFor(t.state, seat);
      if (pool.length === 0) continue;
      const playable = pool.filter((entry) => !requiredTargetsMissing(t.state, entry));
      for (const drop of pool.filter((entry) => requiredTargetsMissing(t.state, entry))) {
        t.emit({ type: 'abilityDropped', id: drop.id }); // 10.7.3.2
      }
      if (playable.length === 0) continue;
      if (playable.length > 1 && !interchangeable(playable)) {
        return {
          kind: 'orderPending',
          seat,
          pending: playable.map((entry) => ({ id: entry.id, label: pendingLabel(t.state, entry) })),
        };
      }
      const chosen = playable[0];
      if (chosen) playPending(t, chosen);
      return null;
    }

    refreshDerived(t);
    popWork(t);
    return null;
  }
  t.emit({ type: 'gameEnded', outcome: { winner: null, reason: 'perpetualCycle' } });
  popWork(t);
  return null;
}

export function answerConfirmation(t: Transcript, prompt: Prompt, intent: Intent): AnswerResult {
  if (prompt.kind === 'keepOnField' || prompt.kind === 'keepInEx') {
    if (intent.type !== 'choose') return REJECTED;
    if (intent.choice.kind !== 'selectCards') return REJECTED;
    const picked = intent.choice.cards;
    if (!isSelection(picked, prompt.candidates, prompt.keep)) return REJECTED;
    const drop = prompt.candidates.filter((id) => !picked.includes(id));
    const zone = prompt.kind === 'keepOnField' ? 'field' : 'ex';
    if (drop.length > 0) {
      moveCards(t, {
        owner: prompt.seat,
        cards: drop,
        from: { zone, seat: prompt.seat },
        to: { zone: 'cemetery', seat: prompt.seat },
        cause: 'rules',
      });
    }
    eliminateIllegalTokens(t);
    return { accepted: true, followUp: null };
  }
  if (prompt.kind === 'orderPending') {
    if (intent.type !== 'choose') return REJECTED;
    const choice = intent.choice;
    if (choice.kind !== 'orderPending') return REJECTED;
    const pending = t.state.pending.find((entry) => entry.id === choice.id);
    if (pending?.seat !== prompt.seat) return REJECTED;
    if (requiredTargetsMissing(t.state, pending)) {
      t.emit({ type: 'abilityDropped', id: pending.id });
      return { accepted: true, followUp: null };
    }
    playPending(t, pending);
    return { accepted: true, followUp: null };
  }
  return REJECTED;
}

function eliminateIllegalTokens(t: Transcript): void {
  const gone: CardId[] = [];
  for (const seat of SEATS) {
    const s = t.state.seats[seat];
    for (const id of [...s.hand, ...s.deck, ...s.cemetery, ...s.evolveDeck]) {
      if (t.state.cards[id]?.token) gone.push(id);
    }
    for (const entry of s.banished) {
      if (t.state.cards[entry.id]?.token) gone.push(entry.id);
    }
  }
  if (gone.length > 0) t.emit({ type: 'tokenEliminated', cards: gone });
}

export function destroyFollower(t: Transcript, seat: Seat, card: CardId): void {
  const owner = t.state.cards[card]?.owner ?? seat;
  moveCards(t, {
    owner: seat,
    cards: [card],
    from: { zone: 'field', seat },
    to: { zone: 'cemetery', seat: owner },
    cause: 'destroy',
  });
}
