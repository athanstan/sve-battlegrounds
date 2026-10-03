import type { CardScript } from '../abilities/spec';
import { textHash } from '../abilities/generic';
import { assertNever, type CardDefId, type CardId } from '../model/ids';
import { STARTING_LIMITS } from '../model/limits';
import type { CardDefinition } from '../model/cards';
import { seedRng } from '../rng';
import {
  ZERO_RESOURCES,
  ZERO_TURN_FLAGS,
  fieldCard,
  type CardInstance,
  type CostDelta,
  type FieldCard,
  type MatchState,
  type Placement,
  type SeatState,
} from '../state/state';
import {
  removeBanished,
  removeCards,
  removeFieldCards,
  removeFromTop,
  removeLinks,
  updateSeat,
} from '../state/zones';
import type { ZoneRef } from '../state/zones-model';
import type { EngineEvent, SeatSetup } from './events';

type MatchCreated = Extract<EngineEvent, { type: 'matchCreated' }>;

function seatFromSetup(setup: SeatSetup): SeatState {
  return {
    leader: { card: setup.leader.id, defense: setup.leaderDefense },
    deck: setup.deck.map((ref) => ref.id),
    evolveDeck: setup.evolve.map((ref) => ref.id),
    evolveDeckRevealed: [],
    hand: [],
    field: [],
    ex: [],
    cemetery: [],
    banished: [],
    evolveZone: [],
    raceZone: [],
    resources: ZERO_RESOURCES,
    limits: STARTING_LIMITS,
    flags: ZERO_TURN_FLAGS,
    drewFromEmptyDeck: false,
  };
}

/** The only way to obtain a `MatchState` from nothing: every match starts with `matchCreated`. */
export function stateFromCreation(event: MatchCreated): MatchState {
  const defs: Record<CardDefId, CardDefinition> = {};
  for (const def of event.defs) defs[def.id] = def;
  for (const def of event.tokens) defs[def.id] = def;

  const scripts: Record<CardDefId, CardScript> = {};
  const pin = (def: (typeof event.defs)[number]) => {
    const script = event.scripts.find(
      (entry) => entry.name === def.name && entry.textHash === textHash(def.text),
    );
    if (script) scripts[def.id] = script;
  };
  for (const def of event.defs) pin(def);
  for (const def of event.tokens) pin(def);

  const tokens: Record<string, CardDefinition> = {};
  for (const def of event.tokens) tokens[def.name] = def;

  const cards: Record<CardId, CardInstance> = {};
  event.seats.forEach((setup, owner) => {
    const seat = owner === 0 ? 0 : 1;
    for (const ref of [setup.leader, ...setup.deck, ...setup.evolve]) {
      cards[ref.id] = { id: ref.id, def: ref.def, owner: seat, token: false };
    }
  });

  return {
    seed: event.seed,
    rng: seedRng(event.seed),
    defs,
    scripts,
    tokens,
    cards,
    seats: [seatFromSetup(event.seats[0]), seatFromSetup(event.seats[1])],
    resolution: [],
    costDeltas: {},
    work: [],
    pending: [],
    delayed: [],
    first: null,
    turnOrderChooser: null,
    turn: 0,
    active: null,
    phase: null,
    step: 'setup/turnOrder',
    prompt: null,
    nextPromptId: 1,
    nextPendingId: 1,
    nextTokenSeq: 1,
    combats: [],
    outcome: null,
    seq: 1,
  };
}

const withPlacement = (field: readonly FieldCard[], ids: readonly CardId[], placement: Placement) =>
  field.map((card) => (ids.includes(card.id) ? { ...card, placement } : card));

function takeFrom(state: MatchState, ref: ZoneRef, cards: readonly CardId[]): MatchState {
  if (ref.zone === 'resolution') {
    const remaining = [...state.resolution];
    for (const card of cards) {
      const index = remaining.findIndex((entry) => entry.card === card);
      if (index === -1) throw new Error(`Card ${card} is not in resolution`);
      remaining.splice(index, 1);
    }
    return { ...state, resolution: remaining };
  }
  return updateSeat(state, ref.seat, (seat) => {
    switch (ref.zone) {
      case 'deck':
        return { ...seat, deck: removeCards(seat.deck, cards, 'deck') };
      case 'hand':
        return { ...seat, hand: removeCards(seat.hand, cards, 'hand') };
      case 'field':
        return { ...seat, field: removeFieldCards(seat.field, cards, 'field') };
      case 'ex':
        return { ...seat, ex: removeCards(seat.ex, cards, 'ex') };
      case 'cemetery':
        return { ...seat, cemetery: removeCards(seat.cemetery, cards, 'cemetery') };
      case 'banished':
        return { ...seat, banished: removeBanished(seat.banished, cards, 'banished') };
      case 'evolveDeck':
        return { ...seat, evolveDeck: removeCards(seat.evolveDeck, cards, 'evolveDeck') };
      case 'evolveDeckRevealed':
        return {
          ...seat,
          evolveDeckRevealed: removeCards(seat.evolveDeckRevealed, cards, 'evolveDeckRevealed'),
        };
      case 'evolveZone':
        return { ...seat, evolveZone: removeLinks(seat.evolveZone, cards, 'evolveZone') };
      case 'raceZone':
        return { ...seat, raceZone: removeLinks(seat.raceZone, cards, 'raceZone') };
    }
  });
}

function putInto(
  state: MatchState,
  event: Extract<EngineEvent, { type: 'cardsMoved' }>,
): MatchState {
  const { to, cards, owner } = event;
  if (to.zone === 'resolution') {
    return {
      ...state,
      resolution: [...state.resolution, ...cards.map((card) => ({ card, controller: owner }))],
    };
  }
  return updateSeat(state, to.seat, (seat) => {
    const at = event.position === 'top' ? 'front' : 'back';
    const insert = (zone: readonly CardId[]): CardId[] =>
      at === 'front' ? [...cards, ...zone] : [...zone, ...cards];
    switch (to.zone) {
      case 'deck':
        return { ...seat, deck: insert(seat.deck) };
      case 'hand':
        return { ...seat, hand: insert(seat.hand) };
      case 'field': {
        const placement = event.placement ?? 'reserved';
        const enteredTurn = event.enteredTurn ?? state.turn;
        const added = cards.map((id) => fieldCard(id, placement, enteredTurn));
        return { ...seat, field: [...seat.field, ...added] };
      }
      case 'ex':
        return { ...seat, ex: insert(seat.ex) };
      case 'cemetery':
        return { ...seat, cemetery: insert(seat.cemetery) };
      case 'banished':
        return {
          ...seat,
          banished: [
            ...seat.banished,
            ...cards.map((id) => ({ id, faceDown: event.faceDown === true })),
          ],
        };
      case 'evolveDeck':
        return { ...seat, evolveDeck: insert(seat.evolveDeck) };
      case 'evolveDeckRevealed':
        return { ...seat, evolveDeckRevealed: insert(seat.evolveDeckRevealed) };
      case 'evolveZone': {
        const linkedTo = event.linkedTo;
        if (!linkedTo) throw new Error('cardsMoved to evolveZone needs linkedTo');
        return {
          ...seat,
          evolveZone: [
            ...seat.evolveZone,
            ...cards.map((card) => ({
              card,
              linkedTo,
              superEvolved: event.superEvolved === true,
            })),
          ],
        };
      }
      case 'raceZone': {
        const linkedTo = event.linkedTo;
        if (!linkedTo) throw new Error('cardsMoved to raceZone needs linkedTo');
        return {
          ...seat,
          raceZone: [...seat.raceZone, ...cards.map((card) => ({ card, linkedTo, faceUp: false }))],
        };
      }
    }
  });
}

/** 4.1.4: a card that changes zones is a new card; drop this-turn cost deltas except EX→field and resolution→field. */
function clearCostDeltas(
  state: MatchState,
  cards: readonly CardId[],
  from: ZoneRef,
  to: ZoneRef,
): MatchState {
  const keep = (from.zone === 'ex' || from.zone === 'resolution') && to.zone === 'field';
  if (keep) return state;
  const next = state.costDeltas;
  let changed = false;
  const copy = { ...next };
  for (const card of cards) {
    if (copy[card]) {
      delete copy[card];
      changed = true;
    }
  }
  return changed ? { ...state, costDeltas: copy } : state;
}

function apply(state: MatchState, event: EngineEvent): MatchState {
  switch (event.type) {
    case 'matchCreated':
      throw new Error('matchCreated starts a match; it cannot be applied to an existing one');

    case 'rngAdvanced':
      return { ...state, rng: event.rng };

    case 'deckShuffled':
      return updateSeat(state, event.seat, (seat) => {
        const sorted = (ids: readonly CardId[]) => [...ids].sort();
        if (sorted(seat.deck).join() !== sorted(event.order).join()) {
          throw new Error('A shuffle must be a permutation of the deck');
        }
        return { ...seat, deck: event.order };
      });

    case 'turnOrderChooserPicked':
      return { ...state, turnOrderChooser: event.seat };

    case 'turnOrderChosen':
      return { ...state, first: event.first };

    case 'cardsDrawn':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        deck: removeFromTop(seat.deck, event.cards),
        hand: [...seat.hand, ...event.cards],
      }));

    case 'cardsBottomed':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        hand: removeCards(seat.hand, event.cards, 'hand'),
        deck: [...seat.deck, ...event.cards],
      }));

    case 'mulliganDecided':
      return state;

    case 'gameStarted':
      return event.seats.reduce<MatchState>(
        (current, start, index) =>
          updateSeat(current, index === 0 ? 0 : 1, (seat) => ({
            ...seat,
            resources: {
              ...seat.resources,
              evolutionPoints: start.evolutionPoints,
              superEvolutionPoints: start.superEvolutionPoints,
            },
          })),
        state,
      );

    case 'turnStarted':
      return updateSeat(
        { ...state, turn: event.turn, active: event.seat, phase: null, combats: [] },
        event.seat,
        (seat) => ({
          ...seat,
          resources: { ...seat.resources, turnsPassed: event.turnsPassed },
          flags: ZERO_TURN_FLAGS,
          field: seat.field.map((card) => ({ ...card, damagedThisTurnBy: [], racedTimes: 0 })),
        }),
      );

    case 'phaseStarted':
      return { ...state, phase: event.phase };

    case 'timingReached':
      return state;

    case 'resourceChanged':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        resources: { ...seat.resources, [event.resource]: event.value },
      }));

    case 'fieldRefreshed':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        field: withPlacement(seat.field, event.cards, 'reserved'),
      }));

    case 'cardsDiscarded':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        hand: removeCards(seat.hand, event.cards, 'hand'),
        cemetery: [...seat.cemetery, ...event.cards],
      }));

    case 'wardsEngaged':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        field: withPlacement(seat.field, event.cards, 'engaged'),
      }));

    case 'drewFromEmptyDeck':
      return updateSeat(state, event.seat, (seat) => ({ ...seat, drewFromEmptyDeck: true }));

    case 'cardsMoved': {
      const taken = takeFrom(state, event.from, event.cards);
      const put = putInto(taken, event);
      return clearCostDeltas(put, event.cards, event.from, event.to);
    }

    case 'cardsRevealed':
      return state;

    case 'fieldCardUpdated':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        field: seat.field.map((card) => (card.id === event.card ? event.field : card)),
      }));

    case 'leaderDefenseChanged':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        leader: { ...seat.leader, defense: event.defense },
      }));

    case 'durationsEnded': {
      // 7.4.8: "until end of turn" / "during this turn" leaves every card; "during your turn"
      // and "start of your next turn" only leave the named seat's cards.
      const both = event.until === 'endOfTurn';
      const strip = (seat: SeatState): SeatState => ({
        ...seat,
        field: seat.field.map((card) => ({
          ...card,
          modifiers: card.modifiers.filter((mod) => mod.until !== event.until),
          granted: card.granted.filter((grant) => grant.until !== event.until),
        })),
      });
      const costDeltas = Object.fromEntries(
        Object.entries(state.costDeltas).flatMap(([id, deltas]) => {
          const kept = deltas.filter((delta) => delta.until !== event.until);
          return kept.length > 0 ? [[id, kept] as const] : [];
        }),
      );
      if (both) {
        return { ...state, costDeltas, seats: [strip(state.seats[0]), strip(state.seats[1])] };
      }
      return updateSeat({ ...state, costDeltas }, event.seat, strip);
    }

    case 'cardPlayed':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        flags: {
          ...seat.flags,
          cardsPlayed: seat.flags.cardsPlayed + 1,
          spellsPlayed:
            state.defs[state.cards[event.card]?.def ?? ('' as CardDefId)]?.kind === 'spell'
              ? seat.flags.spellsPlayed + 1
              : seat.flags.spellsPlayed,
        },
      }));

    case 'tokenCreated': {
      const cards = { ...state.cards };
      for (const ref of event.cards) {
        cards[ref.id] = { id: ref.id, def: ref.def, owner: event.seat, token: true };
      }
      const withCards = { ...state, cards, nextTokenSeq: state.nextTokenSeq + event.cards.length };
      if (event.zone === 'resolution') {
        return {
          ...withCards,
          resolution: [
            ...withCards.resolution,
            ...event.cards.map((ref) => ({ card: ref.id, controller: event.seat })),
          ],
        };
      }
      return updateSeat(withCards, event.seat, (seat) => {
        if (event.zone === 'ex') {
          return { ...seat, ex: [...seat.ex, ...event.cards.map((ref) => ref.id)] };
        }
        const enteredTurn = event.enteredTurn ?? state.turn;
        return {
          ...seat,
          field: [
            ...seat.field,
            ...event.cards.map((ref) => fieldCard(ref.id, 'reserved', enteredTurn)),
          ],
        };
      });
    }

    case 'tokenEliminated': {
      const cards = { ...state.cards };
      for (const id of event.cards) delete cards[id];
      let next: MatchState = { ...state, cards };
      if (next.resolution.some((entry) => event.cards.includes(entry.card))) {
        next = {
          ...next,
          resolution: next.resolution.filter((entry) => !event.cards.includes(entry.card)),
        };
      }
      for (const seat of [0, 1] as const) {
        next = updateSeat(next, seat, (s) => ({
          ...s,
          hand: s.hand.filter((id) => !event.cards.includes(id)),
          field: s.field.filter((entry) => !event.cards.includes(entry.id)),
          ex: s.ex.filter((id) => !event.cards.includes(id)),
          cemetery: s.cemetery.filter((id) => !event.cards.includes(id)),
          deck: s.deck.filter((id) => !event.cards.includes(id)),
          banished: s.banished.filter((entry) => !event.cards.includes(entry.id)),
        }));
      }
      return next;
    }

    case 'followerEvolved':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        flags: { ...seat.flags, evolvedThisTurn: true },
      }));

    case 'followerRaced':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        field: seat.field.map((card) =>
          card.id === event.fieldCard ? { ...card, racedTimes: event.times } : card,
        ),
        flags: { ...seat.flags, evolvedThisTurn: true },
      }));

    case 'damageDealt': {
      if (event.target === 'leader') {
        return updateSeat(state, event.targetSeat, (seat) => ({
          ...seat,
          leader: { ...seat.leader, defense: seat.leader.defense - event.amount },
        }));
      }
      const target = event.target;
      const source = event.source;
      return updateSeat(state, event.targetSeat, (seat) => ({
        ...seat,
        field: seat.field.map((card) => {
          if (card.id !== target) return card;
          return {
            ...card,
            damageTaken: card.damageTaken + event.amount,
            damagedThisTurnBy: source
              ? [...card.damagedThisTurnBy, source]
              : card.damagedThisTurnBy,
          };
        }),
      }));
    }

    case 'attackDeclared':
    case 'attackEnded':
      return state;

    case 'fought':
      return { ...state, combats: [...state.combats, { a: event.a, b: event.b }] };

    case 'abilityPending':
      return {
        ...state,
        pending: [
          ...state.pending,
          {
            id: event.id,
            seat: event.seat,
            source: event.source,
            sourceDef: event.sourceDef,
            abilityKey: event.abilityKey,
            triggerSeq: event.triggerSeq,
          },
        ],
        nextPendingId: Math.max(state.nextPendingId, event.id + 1),
        seats: ((): MatchState['seats'] => {
          const next = updateSeat(state, event.seat, (seat) => ({
            ...seat,
            flags: {
              ...seat.flags,
              pendingCounts: {
                ...seat.flags.pendingCounts,
                [event.abilityKey]: (seat.flags.pendingCounts[event.abilityKey] ?? 0) + 1,
              },
            },
          }));
          return next.seats;
        })(),
      };

    case 'abilityResolved':
    case 'abilityDropped':
      return { ...state, pending: state.pending.filter((entry) => entry.id !== event.id) };

    case 'delayedQueued':
      return {
        ...state,
        delayed: [...state.delayed, event.delayed],
        nextPendingId: Math.max(state.nextPendingId, event.delayed.id + 1),
      };

    case 'delayedConsumed':
      return { ...state, delayed: state.delayed.filter((entry) => entry.id !== event.id) };

    case 'carrotsTurned':
      return updateSeat(state, event.seat, (seat) => ({
        ...seat,
        raceZone: seat.raceZone.map((link) =>
          event.cards.includes(link.card) ? { ...link, faceUp: event.faceUp } : link,
        ),
      }));

    case 'promptOpened':
      return { ...state, prompt: event.prompt, nextPromptId: event.prompt.id + 1 };

    case 'promptClosed':
      if (state.prompt?.id !== event.promptId) {
        throw new Error(`Prompt ${event.promptId} is not the open prompt`);
      }
      return { ...state, prompt: null };

    case 'turnEnded':
      return { ...state, phase: null };

    case 'gameEnded':
      return { ...state, outcome: event.outcome, prompt: null, step: 'over', work: [] };

    case 'stepChanged':
      return { ...state, step: event.step };

    case 'workPushed':
      return { ...state, work: [...state.work, event.frame] };

    case 'workPopped':
      return { ...state, work: state.work.slice(0, -1) };

    case 'workUpdated':
      return { ...state, work: [...state.work.slice(0, -1), event.frame] };

    case 'flagsChanged':
      return updateSeat(state, event.seat, (seat) => ({ ...seat, flags: event.flags }));

    case 'costDeltaApplied': {
      const existing: readonly CostDelta[] = state.costDeltas[event.card] ?? [];
      return {
        ...state,
        costDeltas: {
          ...state.costDeltas,
          [event.card]: [...existing, { amount: event.amount, until: event.until }],
        },
      };
    }

    default:
      return assertNever(event);
  }
}

/** Apply one event. Total over `EngineEvent`; every application advances `seq` by exactly one. */
export function applyEvent(state: MatchState, event: EngineEvent): MatchState {
  const next = apply(state, event);
  return { ...next, seq: state.seq + 1 };
}

/** Rebuild a match from its stored event log (replays, crash recovery). */
export function replay(events: readonly EngineEvent[]): MatchState {
  const [first, ...rest] = events;
  if (first?.type !== 'matchCreated') throw new Error('A match log must start with matchCreated');
  return rest.reduce(applyEvent, stateFromCreation(first));
}
