import { describe, expect, it } from 'vitest';
import { applyEvent, stateFromCreation } from '../events/apply';
import type { EngineEvent } from '../events/events';
import { SEATS, opponentOf, type CardId } from '../model/ids';
import type { MatchState, Prompt } from '../state/state';
import { defaultAnswer, playUntil, started, must } from '../testing/support';
import { projectEvent, type ClientEvent } from './events';
import { foldView } from './fold';
import { project } from './project';
import { canSeeEvolveDeck, canSeeHand, seatViewer, spectatorViewer, type Viewer } from './viewer';

const SEED = 'leak-test-seed-xyz';

const VIEWERS: readonly { name: string; viewer: Viewer }[] = [
  { name: 'seat 0', viewer: seatViewer(0) },
  { name: 'seat 1', viewer: seatViewer(1) },
  { name: 'closed spectator', viewer: spectatorViewer() },
  { name: 'spectator seeing seat 0', viewer: spectatorViewer([0]) },
  { name: 'spectator seeing both hands', viewer: spectatorViewer([0, 1]) },
];

/** Redraw the opening hand for the first player only, so the log contains a bottoming too. */
const answer = (prompt: Prompt, state: MatchState) => {
  if (prompt.kind === 'mulligan' && prompt.seat === state.first) {
    return {
      seat: prompt.seat,
      intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'mulligan', redraw: true } },
    } as const;
  }
  return defaultAnswer(prompt);
};

/** Play a full stretch of match and return the log. */
function playMatch(turns: number) {
  let run = started(SEED);
  while (run.state.prompt && !run.state.outcome && run.state.turn < turns) {
    run = must(run, answer(run.state.prompt, run.state));
  }
  return run;
}

/** Every state the log passes through, one per event. */
interface Step {
  readonly event: EngineEvent;
  readonly state: MatchState;
}

function statesAlong(events: readonly EngineEvent[]): Step[] {
  const [created, ...rest] = events;
  if (created?.type !== 'matchCreated') throw new Error('log must start with matchCreated');
  let state = stateFromCreation(created);
  const steps: Step[] = [{ event: created, state }];
  for (const event of rest) {
    state = applyEvent(state, event);
    steps.push({ event, state });
  }
  return steps;
}

/** Card ids this viewer must never be able to read from state `state`. */
function hiddenIds(state: MatchState, viewer: Viewer): CardId[] {
  return SEATS.flatMap((seat) => [
    ...state.seats[seat].deck,
    ...(canSeeHand(viewer, seat) ? [] : state.seats[seat].hand),
    ...(canSeeEvolveDeck(viewer, seat) ? [] : state.seats[seat].evolveDeck),
  ]);
}

/**
 * Ids an event may name to this viewer: what they could already read just before it. A
 * mulligan tells the owner which cards of their own hand went to the bottom; that is not news.
 */
const alreadyKnown = (before: MatchState | undefined, viewer: Viewer): Set<CardId> =>
  new Set(
    before
      ? SEATS.flatMap((seat) => (canSeeHand(viewer, seat) ? before.seats[seat].hand : []))
      : [],
  );

const mentions = (payload: unknown, id: string) => JSON.stringify(payload).includes(`"${id}"`);

const log = playMatch(14);
const steps = statesAlong(log.events);

describe('the log used by these tests', () => {
  it('is long enough to cover mulligans, draws, discards and several turns', () => {
    const types = new Set(log.events.map((event) => event.type));
    for (const type of [
      'cardsBottomed',
      'cardsDrawn',
      'cardsDiscarded',
      'turnEnded',
      'resourceChanged',
    ] as const) {
      expect(types).toContain(type);
    }
    expect(steps.at(-1)?.state).toEqual(log.state);
  });
});

describe('projecting state (the visibility table)', () => {
  const state = playUntil(started('table'), (s) => s.turn === 3 && s.prompt?.kind === 'main').state;

  it('lets a player read their own hand and evolve deck, and only count the opponent’s', () => {
    for (const seat of SEATS) {
      const view = project(state, seatViewer(seat));
      const mine = view.seats[seat];
      const theirs = view.seats[opponentOf(seat)];

      expect(mine.hand.cards?.map((card) => card.id)).toEqual(state.seats[seat].hand);
      expect(mine.hand.count).toBe(state.seats[seat].hand.length);
      expect(mine.evolveDeck.cards?.map((card) => card.id)).toEqual(state.seats[seat].evolveDeck);

      expect(theirs.hand.cards).toBeNull();
      expect(theirs.hand.count).toBe(state.seats[opponentOf(seat)].hand.length);
      expect(theirs.evolveDeck.cards).toBeNull();
      expect(theirs.evolveDeck.count).toBe(state.seats[opponentOf(seat)].evolveDeck.length);
    }
  });

  it('never lists a deck, for anyone, even its owner', () => {
    for (const { viewer } of VIEWERS) {
      const view = project(state, viewer);
      for (const seat of view.seats) expect(seat.deck).toEqual({ count: expect.any(Number) });
    }
  });

  it('shows a closed spectator counts only, and an opened hand only for the chosen seat', () => {
    const closed = project(state, spectatorViewer());
    expect(closed.seats.map((seat) => seat.hand.cards)).toEqual([null, null]);
    expect(closed.seats.map((seat) => seat.evolveDeck.cards)).toEqual([null, null]);

    const open = project(state, spectatorViewer([1]));
    expect(open.seats[0].hand.cards).toBeNull();
    expect(open.seats[1].hand.cards?.map((card) => card.id)).toEqual(state.seats[1].hand);
    expect(open.seats[1].evolveDeck.cards).toBeNull(); // the evolve deck is never opened to spectators
  });

  it('shows public zones to everyone', () => {
    const atDiscard = playUntil(started('table'), (s) => s.prompt?.kind === 'discard');
    const prompt = atDiscard.state.prompt;
    if (prompt?.kind !== 'discard') throw new Error('expected a discard prompt');
    const discarded = prompt.candidates[0]!;
    const after = must(atDiscard, {
      seat: prompt.seat,
      intent: {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'discard', cards: [discarded] },
      },
    }).state;

    for (const { viewer } of VIEWERS) {
      const view = project(after, viewer);
      expect(view.seats[prompt.seat].cemetery.map((card) => card.id)).toEqual([discarded]);
    }
  });

  it('tells everyone who the match is waiting on, but addresses the prompt to one seat', () => {
    const prompt = state.prompt!;
    for (const { viewer } of VIEWERS) {
      const view = project(state, viewer);
      expect(view.waitingOn).toEqual({ id: prompt.id, seat: prompt.seat, kind: prompt.kind });
      const addressed = viewer.kind === 'seat' && viewer.seat === prompt.seat;
      expect(view.prompt).toEqual(addressed ? prompt : null);
    }
  });

  it('serialises as plain JSON', () => {
    for (const { viewer } of VIEWERS) {
      const view = project(state, viewer);
      expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
    }
  });
});

describe('leak-freedom', () => {
  it('detects a leak when there is one (the scan is not vacuous)', () => {
    const drawn = log.events.find((event) => event.type === 'cardsDrawn' && event.seat === 1);
    if (drawn?.type !== 'cardsDrawn') throw new Error('expected a draw');
    // The raw engine event names the card; a projection for seat 0 must not.
    expect(mentions(drawn, drawn.cards[0]!)).toBe(true);
  });

  for (const { name, viewer } of VIEWERS) {
    it(`never puts a hidden card id in a view for ${name}`, () => {
      for (const { state } of steps) {
        const payload = project(state, viewer);
        for (const id of hiddenIds(state, viewer)) {
          expect(mentions(payload, id), `card ${id} leaked at seq ${state.seq}`).toBe(false);
        }
        expect(JSON.stringify(payload)).not.toContain(SEED);
      }
    });

    it(`never puts a hidden card id in an event for ${name}`, () => {
      steps.forEach(({ event, state }, index) => {
        const payload = projectEvent(event, viewer, state);
        if (payload === null) return;
        const known = alreadyKnown(steps[index - 1]?.state, viewer);
        for (const id of hiddenIds(state, viewer).filter((candidate) => !known.has(candidate))) {
          expect(mentions(payload, id), `card ${id} leaked by ${event.type}`).toBe(false);
        }
        expect(JSON.stringify(payload)).not.toContain(SEED);
      });
    });
  }

  it('does not forward server-only bookkeeping', () => {
    const kinds = new Set(
      log.events
        .filter((event) => projectEvent(event, seatViewer(0), log.state) === null)
        .map((e) => e.type),
    );
    expect(kinds.has('rngAdvanced')).toBe(true);
    expect(kinds.has('stepChanged')).toBe(true);
  });
});

describe('keeping a client in sync', () => {
  for (const { name, viewer } of VIEWERS) {
    it(`rebuilds exactly the projected view from events alone, for ${name}`, () => {
      let view = null as ReturnType<typeof project> | null;
      for (const { event, state } of steps) {
        const projected: ClientEvent | null = projectEvent(event, viewer, state);
        if (projected) view = foldView(view, projected);
        if (view === null) continue;
        expect(view, `diverged after ${event.type} at seq ${state.seq}`).toEqual(
          project(state, viewer),
        );
      }
      expect(view).toEqual(project(log.state, viewer));
    });
  }

  it('can join mid-match from a snapshot and follow the rest of the log', () => {
    const viewer = seatViewer(1);
    const cut = Math.floor(steps.length / 2);
    const midpoint = steps[cut];
    if (!midpoint) throw new Error('log too short');
    let view: ReturnType<typeof project> | null = project(midpoint.state, viewer);
    for (const { event, state } of steps.slice(cut + 1)) {
      const projected = projectEvent(event, viewer, state);
      if (projected) view = foldView(view, projected);
    }
    expect(view).toEqual(project(log.state, viewer));
  });

  it('refuses an event stream that does not begin at the start', () => {
    expect(() => foldView(null, { type: 'turnEnded', seat: 0 })).toThrow(/before matchCreated/);
  });

  it('refuses a second matchCreated', () => {
    const first = steps[0];
    if (!first) throw new Error('empty log');
    const created = projectEvent(first.event, seatViewer(0), first.state);
    if (!created) throw new Error('matchCreated must be delivered');
    expect(() => foldView(foldView(null, created), created)).toThrow(/already in progress/);
  });
});
