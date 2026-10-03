import { assertNever, type CardId, type CardRef, type Seat } from '../model/ids';
import { STARTING_LIMITS } from '../model/limits';
import { ZERO_RESOURCES, type Placement } from '../state/state';
import type { ZoneRef } from '../state/zones-model';
import type { ClientEvent, SeatIntro } from './events';
import type { FieldCardView, MatchView, SeatView } from './view';
import { canSeeHand, type Viewer } from './viewer';

/**
 * Fold a client event into a view: the client-side counterpart of the engine's `applyEvent`.
 * A client that receives every projected event, in order, holds exactly the view
 * `project(state, viewer)` would produce; the test suite checks this for whole matches.
 */

const EMPTY_SHOWN = { attack: 0, defense: 0, keywords: [] as const };

function seatFromIntro(seat: Seat, intro: SeatIntro, viewer: Viewer): SeatView {
  return {
    seat,
    leader: { card: intro.leader, defense: intro.leaderDefense },
    resources: ZERO_RESOURCES,
    limits: STARTING_LIMITS,
    deck: { count: intro.deckCount },
    evolveDeck: { count: intro.evolve.count, cards: intro.evolve.cards, revealed: [] },
    hand: { count: 0, cards: canSeeHand(viewer, seat) ? [] : null },
    field: [],
    ex: [],
    cemetery: [],
    banished: [],
    evolveZone: [],
    raceZone: [],
  };
}

function updateSeatView(
  view: MatchView,
  seat: Seat,
  update: (current: SeatView) => SeatView,
): MatchView {
  const seats: [SeatView, SeatView] = [view.seats[0], view.seats[1]];
  seats[seat] = update(view.seats[seat]);
  return { ...view, seats };
}

const withPlacement = (
  field: SeatView['field'],
  ids: readonly CardId[],
  placement: Placement,
): SeatView['field'] =>
  field.map((entry) => (ids.includes(entry.card.id) ? { ...entry, placement } : entry));

/** Remove the given ids from a visible hand; a hidden hand (`null`) stays hidden. */
const withoutCards = (cards: SeatView['hand']['cards'], ids: readonly CardId[] | null) =>
  cards && ids ? cards.filter((card) => !ids.includes(card.id)) : cards;

const idsOf = (cards: readonly CardRef[] | null | undefined): readonly CardId[] =>
  cards?.map((card) => card.id) ?? [];

function takeViewCards(
  seat: SeatView,
  from: ZoneRef,
  ids: readonly CardId[],
  count: number,
): SeatView {
  if (from.zone === 'resolution' || from.seat !== seat.seat) {
    return seat;
  }
  const removed = Math.max(ids.length, count);
  switch (from.zone) {
    case 'deck':
      return { ...seat, deck: { count: Math.max(0, seat.deck.count - removed) } };
    case 'hand':
      return {
        ...seat,
        hand: {
          count: Math.max(0, seat.hand.count - removed),
          cards: withoutCards(seat.hand.cards, ids),
        },
      };
    case 'field':
      return { ...seat, field: seat.field.filter((entry) => !ids.includes(entry.card.id)) };
    case 'ex':
      return { ...seat, ex: seat.ex.filter((card) => !ids.includes(card.id)) };
    case 'cemetery':
      return { ...seat, cemetery: seat.cemetery.filter((card) => !ids.includes(card.id)) };
    case 'banished':
      return {
        ...seat,
        banished: seat.banished.filter((entry) => !entry.card || !ids.includes(entry.card.id)),
      };
    case 'evolveDeck':
      return {
        ...seat,
        evolveDeck: {
          ...seat.evolveDeck,
          count: Math.max(0, seat.evolveDeck.count - removed),
          cards: seat.evolveDeck.cards
            ? seat.evolveDeck.cards.filter((card) => !ids.includes(card.id))
            : null,
        },
      };
    case 'evolveDeckRevealed':
      return {
        ...seat,
        evolveDeck: {
          ...seat.evolveDeck,
          revealed: seat.evolveDeck.revealed.filter((card) => !ids.includes(card.id)),
        },
      };
    case 'evolveZone':
      return {
        ...seat,
        evolveZone: seat.evolveZone.filter((link) => !ids.includes(link.card.id)),
      };
    case 'raceZone':
      return { ...seat, raceZone: seat.raceZone.filter((link) => !ids.includes(link.card.id)) };
  }
}

function putViewCards(
  seat: SeatView,
  to: ZoneRef,
  cards: readonly CardRef[] | null,
  count: number,
  extra: {
    readonly faceDown?: boolean;
    readonly placement?: Placement;
    readonly enteredTurn?: number;
    readonly linkedTo?: CardId;
    readonly superEvolved?: boolean;
  },
): SeatView {
  if (to.zone === 'resolution' || to.seat !== seat.seat) return seat;
  const refs = cards ?? [];
  switch (to.zone) {
    case 'deck':
      return { ...seat, deck: { count: seat.deck.count + count } };
    case 'hand':
      return {
        ...seat,
        hand: {
          count: seat.hand.count + count,
          cards: seat.hand.cards ? [...seat.hand.cards, ...refs] : seat.hand.cards,
        },
      };
    case 'field':
      return {
        ...seat,
        field: [
          ...seat.field,
          ...refs.map((card): FieldCardView => ({
            card,
            placement: extra.placement ?? 'reserved',
            enteredTurn: extra.enteredTurn ?? 0,
            shown: EMPTY_SHOWN,
            racedTimes: 0,
          })),
        ],
      };
    case 'ex':
      return { ...seat, ex: [...seat.ex, ...refs] };
    case 'cemetery':
      return { ...seat, cemetery: [...seat.cemetery, ...refs] };
    case 'banished':
      return {
        ...seat,
        banished: [
          ...seat.banished,
          ...(cards
            ? cards.map((card) => ({
                card: extra.faceDown ? null : card,
                faceDown: extra.faceDown === true,
              }))
            : Array.from({ length: count }, () => ({
                card: null,
                faceDown: extra.faceDown === true,
              }))),
        ],
      };
    case 'evolveDeck':
      return {
        ...seat,
        evolveDeck: {
          ...seat.evolveDeck,
          count: seat.evolveDeck.count + count,
          cards: seat.evolveDeck.cards ? [...seat.evolveDeck.cards, ...refs] : null,
        },
      };
    case 'evolveDeckRevealed':
      return {
        ...seat,
        evolveDeck: { ...seat.evolveDeck, revealed: [...seat.evolveDeck.revealed, ...refs] },
      };
    case 'evolveZone': {
      const linkedTo = extra.linkedTo;
      return {
        ...seat,
        evolveZone: linkedTo
          ? [
              ...seat.evolveZone,
              ...refs.map((card) => ({
                card,
                linkedTo,
                superEvolved: extra.superEvolved === true,
              })),
            ]
          : seat.evolveZone,
      };
    }
    case 'raceZone': {
      const linkedTo = extra.linkedTo;
      return {
        ...seat,
        raceZone: linkedTo
          ? [
              ...seat.raceZone,
              ...refs.map((card) => ({
                card,
                linkedTo,
                superEvolved: false,
              })),
            ]
          : seat.raceZone,
      };
    }
  }
}

export function foldView(view: MatchView | null, event: ClientEvent): MatchView {
  if (event.type === 'matchCreated') {
    if (view !== null) throw new Error('matchCreated received for a match already in progress');
    return {
      viewer: event.viewer,
      first: null,
      turn: 0,
      active: null,
      phase: null,
      seats: [
        seatFromIntro(0, event.seats[0], event.viewer),
        seatFromIntro(1, event.seats[1], event.viewer),
      ],
      resolution: [],
      waitingOn: null,
      prompt: null,
      outcome: null,
    };
  }
  if (view === null) throw new Error(`Received ${event.type} before matchCreated`);

  switch (event.type) {
    case 'deckShuffled':
    case 'turnOrderChooserPicked':
    case 'mulliganDecided':
    case 'drewFromEmptyDeck':
    case 'timingReached':
    case 'durationsEnded':
    case 'cardPlayed':
    case 'cardsRevealed':
    case 'attackDeclared':
    case 'attackEnded':
    case 'fought':
    case 'abilityPending':
    case 'abilityResolved':
    case 'costDeltaApplied':
    case 'followerEvolved':
    case 'followerRaced':
    case 'carrotsTurned':
      return view;

    case 'damageDealt':
      if (event.target === 'leader') {
        return updateSeatView(view, event.targetSeat, (seat) => ({
          ...seat,
          leader: { ...seat.leader, defense: seat.leader.defense - event.amount },
        }));
      }
      return updateSeatView(view, event.targetSeat, (seat) => ({
        ...seat,
        field: seat.field.map((entry) =>
          entry.card.id === event.target
            ? { ...entry, shown: { ...entry.shown, defense: entry.shown.defense - event.amount } }
            : entry,
        ),
      }));

    case 'turnOrderChosen':
      return { ...view, first: event.first };

    case 'cardsDrawn':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        deck: { count: seat.deck.count - event.count },
        hand: {
          count: seat.hand.count + event.count,
          cards:
            seat.hand.cards && event.cards ? [...seat.hand.cards, ...event.cards] : seat.hand.cards,
        },
      }));

    case 'cardsBottomed':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        deck: { count: seat.deck.count + event.count },
        hand: {
          count: seat.hand.count - event.count,
          cards: withoutCards(seat.hand.cards, event.cards),
        },
      }));

    case 'gameStarted':
      return event.seats.reduce<MatchView>(
        (current, start, index) =>
          updateSeatView(current, index === 0 ? 0 : 1, (seat) => ({
            ...seat,
            resources: {
              ...seat.resources,
              evolutionPoints: start.evolutionPoints,
              superEvolutionPoints: start.superEvolutionPoints,
            },
          })),
        view,
      );

    case 'turnStarted':
      return updateSeatView(
        { ...view, turn: event.turn, active: event.seat, phase: null },
        event.seat,
        (seat) => ({ ...seat, resources: { ...seat.resources, turnsPassed: event.turnsPassed } }),
      );

    case 'phaseStarted':
      return { ...view, phase: event.phase };

    case 'resourceChanged':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        resources: { ...seat.resources, [event.resource]: event.value },
      }));

    case 'fieldRefreshed':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        field: withPlacement(seat.field, event.cards, 'reserved'),
      }));

    case 'wardsEngaged':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        field: withPlacement(seat.field, event.cards, 'engaged'),
      }));

    case 'cardsDiscarded':
      return updateSeatView(view, event.seat, (seat) => {
        const ids = event.cards.map((card) => card.id);
        return {
          ...seat,
          hand: { count: seat.hand.count - ids.length, cards: withoutCards(seat.hand.cards, ids) },
          cemetery: [...seat.cemetery, ...event.cards],
        };
      });

    case 'promptOpened':
      return { ...view, waitingOn: event.waitingOn, prompt: event.prompt };

    case 'promptClosed':
      return { ...view, waitingOn: null, prompt: null };

    case 'turnEnded':
      return { ...view, phase: null };

    case 'gameEnded':
      return { ...view, outcome: event.outcome, waitingOn: null, prompt: null };

    case 'leaderDefenseChanged':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        leader: { ...seat.leader, defense: event.defense },
      }));

    case 'fieldCardUpdated':
      return updateSeatView(view, event.seat, (seat) => ({
        ...seat,
        field: seat.field.map((entry) =>
          entry.card.id === event.card
            ? {
                ...entry,
                shown: event.shown,
                placement: event.placement,
                racedTimes: event.racedTimes,
              }
            : entry,
        ),
      }));

    case 'cardsMoved': {
      const ids = idsOf(event.cards);
      let next = view;
      if (event.from.zone === 'resolution') {
        next = {
          ...next,
          resolution: next.resolution.filter((entry) => !ids.includes(entry.card.id)),
        };
      } else {
        next = updateSeatView(next, event.from.seat, (seat) =>
          takeViewCards(seat, event.from, ids, event.count),
        );
      }
      if (event.to.zone === 'resolution') {
        const cards = event.cards ?? [];
        next = {
          ...next,
          resolution: [
            ...next.resolution,
            ...cards.map((card) => ({ card, controller: event.owner })),
          ],
        };
      } else {
        next = updateSeatView(next, event.to.seat, (seat) =>
          putViewCards(seat, event.to, event.cards, event.count, event),
        );
      }
      return next;
    }

    case 'tokenCreated': {
      if (event.zone === 'resolution') {
        return {
          ...view,
          resolution: [
            ...view.resolution,
            ...event.cards.map((card) => ({ card, controller: event.seat })),
          ],
        };
      }
      return updateSeatView(view, event.seat, (seat) => {
        if (event.zone === 'ex') return { ...seat, ex: [...seat.ex, ...event.cards] };
        return {
          ...seat,
          field: [
            ...seat.field,
            ...event.cards.map((card): FieldCardView => ({
              card,
              placement: 'reserved',
              enteredTurn: event.enteredTurn ?? 0,
              shown: EMPTY_SHOWN,
              racedTimes: 0,
            })),
          ],
        };
      });
    }

    case 'tokenEliminated': {
      const gone = new Set(event.cards);
      return {
        ...view,
        resolution: view.resolution.filter((entry) => !gone.has(entry.card.id)),
        seats: [stripTokens(view.seats[0], gone), stripTokens(view.seats[1], gone)],
      };
    }

    default:
      return assertNever(event, 'Unhandled client event');
  }
}

function stripTokens(seat: SeatView, gone: ReadonlySet<CardId>): SeatView {
  return {
    ...seat,
    field: seat.field.filter((entry) => !gone.has(entry.card.id)),
    ex: seat.ex.filter((card) => !gone.has(card.id)),
    hand: {
      count: seat.hand.cards
        ? seat.hand.cards.filter((card) => !gone.has(card.id)).length
        : seat.hand.count,
      cards: seat.hand.cards ? seat.hand.cards.filter((card) => !gone.has(card.id)) : null,
    },
    cemetery: seat.cemetery.filter((card) => !gone.has(card.id)),
  };
}
