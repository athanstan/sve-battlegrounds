import type { CardId, CardRef, Seat } from '../model/ids';
import { refOf, type MatchState, type Prompt } from '../state/state';
import { canSeeEvolveDeck, canSeeHand, isAddressedBy, type Viewer } from './viewer';
import type { MatchView, PromptSummary, SeatView, Snapshot } from './view';

export function cardRef(state: MatchState, id: CardId): CardRef {
  return refOf(state, id);
}

const refs = (state: MatchState, ids: readonly CardId[]): CardRef[] =>
  ids.map((id) => cardRef(state, id));

function projectSeat(state: MatchState, seat: Seat, viewer: Viewer): SeatView {
  const s = state.seats[seat];
  return {
    seat,
    leader: { card: cardRef(state, s.leader.card), defense: s.leader.defense },
    resources: s.resources,
    limits: s.limits,
    deck: { count: s.deck.length },
    evolveDeck: {
      count: s.evolveDeck.length,
      cards: canSeeEvolveDeck(viewer, seat) ? refs(state, s.evolveDeck) : null,
      revealed: refs(state, s.evolveDeckRevealed),
    },
    hand: {
      count: s.hand.length,
      cards: canSeeHand(viewer, seat) ? refs(state, s.hand) : null,
    },
    field: s.field.map((fieldCard) => ({
      card: cardRef(state, fieldCard.id),
      placement: fieldCard.placement,
      enteredTurn: fieldCard.enteredTurn,
      shown: fieldCard.shown,
      racedTimes: fieldCard.racedTimes,
      counters: fieldCard.counters,
      equipped: refs(state, fieldCard.equipped),
    })),
    ex: refs(state, s.ex),
    cemetery: refs(state, s.cemetery),
    banished: s.banished.map((entry) => ({
      card: entry.faceDown ? null : cardRef(state, entry.id),
      faceDown: entry.faceDown,
    })),
    evolveZone: s.evolveZone.map((link) => ({
      card: cardRef(state, link.card),
      linkedTo: link.linkedTo,
      superEvolved: link.superEvolved,
    })),
    raceZone: s.raceZone.map((link) => ({
      card: cardRef(state, link.card),
      linkedTo: link.linkedTo,
      superEvolved: false,
    })),
  };
}

export function summarize(prompt: Prompt): PromptSummary {
  return { id: prompt.id, seat: prompt.seat, kind: prompt.kind };
}

/**
 * Project the authoritative state for one viewer. This is the only function that turns
 * `MatchState` into something a client receives, and the property tests assert that its
 * output never contains a card id the viewer cannot see.
 */
export function project(state: MatchState, viewer: Viewer): MatchView {
  const { prompt } = state;
  return {
    viewer,
    first: state.first,
    turn: state.turn,
    active: state.active,
    phase: state.phase,
    seats: [projectSeat(state, 0, viewer), projectSeat(state, 1, viewer)],
    resolution: state.resolution.map((entry) => ({
      card: cardRef(state, entry.card),
      controller: entry.controller,
    })),
    waitingOn: prompt ? summarize(prompt) : null,
    prompt: prompt && isAddressedBy(viewer, prompt.seat) ? prompt : null,
    outcome: state.outcome,
  };
}

export const snapshot = (state: MatchState, viewer: Viewer): Snapshot => ({
  seq: state.seq,
  view: project(state, viewer),
});
