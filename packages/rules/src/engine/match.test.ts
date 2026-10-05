import { describe, expect, it } from 'vitest';
import type { Action } from '../actions/intents';
import { replay } from '../events/apply';
import {
  asCardDefId,
  asCardId,
  opponentOf,
  type CardDefId,
  type CardId,
  type Seat,
} from '../model/ids';
import { STARTING_LEADER_DEFENSE } from '../model/limits';
import { fieldCard, type MatchState, type Prompt } from '../state/state';
import {
  LEADER,
  OTHER_LEADER,
  WARD_FOLLOWER,
  atFirstMainPhase,
  defaultAnswer,
  legalDeck,
  must,
  newMatch,
  playUntil,
  started,
  testCatalog,
  type Run,
} from '../testing/support';
import { InvalidDeckError, createMatch } from './create';
import { confirmationTiming } from './confirmation';
import { reduce } from './reduce';
import { Transcript } from './transcript';
import { textHash } from '../abilities/generic';
import { cardKey, type CardCatalog } from '../model/cards';
import type { CardScript } from '../abilities/spec';

const promptOf = (state: MatchState): Prompt => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

const seatOf = (state: MatchState, seat: Seat) => state.seats[seat];

/** Craft a state by replacing parts of one seat. */
const setSeat = (
  state: MatchState,
  seat: Seat,
  patch: Partial<MatchState['seats'][0]>,
): MatchState => ({
  ...state,
  seats:
    seat === 0
      ? [{ ...state.seats[0], ...patch }, state.seats[1]]
      : [state.seats[0], { ...state.seats[1], ...patch }],
});

const toNextTurn = (run: Run): Run => {
  const turn = run.state.turn;
  return playUntil(run, (state) => state.turn > turn && state.prompt?.kind === 'main');
};

describe('creating a match (CR 6.2.1)', () => {
  it('presents both decks, shuffles them and asks one seat to choose turn order', () => {
    const { state, events } = newMatch();

    expect(events[0]?.type).toBe('matchCreated');
    expect(state.seats.map((seat) => seat.deck.length)).toEqual([42, 42]);
    expect(state.seats.map((seat) => seat.evolveDeck.length)).toEqual([3, 3]);
    expect(state.seats.map((seat) => seat.hand.length)).toEqual([0, 0]);
    expect(state.seats.map((seat) => seat.leader.defense)).toEqual([
      STARTING_LEADER_DEFENSE,
      STARTING_LEADER_DEFENSE,
    ]);

    const prompt = promptOf(state);
    expect(prompt.kind).toBe('turnOrder');
    expect(prompt.seat).toBe(state.turnOrderChooser);
    expect(state.outcome).toBeNull();
  });

  it('rejects an illegal deck before anything is created', () => {
    const bad = { ...legalDeck(), main: legalDeck().main.slice(0, 5) };
    expect(() => newMatch('s', [bad, legalDeck()])).toThrow(InvalidDeckError);
    try {
      newMatch('s', [legalDeck(), bad]);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDeckError);
      expect((error as InvalidDeckError).seat).toBe(1);
    }
  });

  it('is fully determined by its seed', () => {
    expect(newMatch('same').events).toEqual(newMatch('same').events);
    expect(newMatch('same').state.seats[0].deck).not.toEqual(newMatch('other').state.seats[0].deck);
  });

  it('picks the turn-order chooser at random, not always the same seat', () => {
    const choosers = new Set(
      Array.from({ length: 24 }, (_, n) => newMatch(`chooser-${n}`).state.turnOrderChooser),
    );
    expect(choosers).toEqual(new Set([0, 1]));
  });

  it('numbers cards without regard to their identity or position', () => {
    // If ids were handed out in deck-list order, id n and n+1 would usually be copies.
    let neighbours = 0;
    let sameCard = 0;
    for (let n = 0; n < 20; n++) {
      const [first] = newMatch(`ids-${n}`).events;
      if (first?.type !== 'matchCreated') throw new Error('unreachable');
      const deck = first.seats[0].deck;
      for (let i = 0; i + 1 < deck.length; i++) {
        neighbours++;
        if (deck[i]?.def === deck[i + 1]?.def) sameCard++;
      }
    }
    // 14 distinct names x 3 copies: random neighbours match ~5% of the time, grouped ones ~67%.
    expect(sameCard / neighbours).toBeLessThan(0.15);
  });

  it('pins a script onto a reprint whose text is listed in alsoHashes', () => {
    const defId = asCardDefId('test-follower-0');
    const reprint = '[fanfare] Draw a card.';
    const catalog: CardCatalog = (id) => {
      const base = testCatalog(id);
      if (!base || id !== defId) return base;
      return { ...base, text: reprint };
    };
    const script: CardScript = {
      key: cardKey('Test Follower 0'),
      name: 'Test Follower 0',
      textHash: textHash('fanfare Draw a card.'),
      alsoHashes: [textHash(reprint)],
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [{ op: 'draw', n: 1 }],
        },
      ],
    };
    const created = createMatch({
      seed: 'also-hashes-pin',
      catalog,
      scripts: (def) => (def.id === defId ? script : null),
      players: [{ deck: legalDeck(LEADER) }, { deck: legalDeck(OTHER_LEADER) }],
    });
    expect(created.state.scripts[defId]?.abilities[0]).toMatchObject({ on: 'fanfare' });
  });
});

describe('opening the game (CR 6.2.1.6-6.2.1.14)', () => {
  it('lets the chooser go first, then deals four cards to each seat', () => {
    const run = started();
    const chooser = run.state.turnOrderChooser!;
    const next = must(run, defaultAnswer(promptOf(run.state)));

    expect(next.state.first).toBe(chooser);
    expect(seatOf(next.state, 0).hand).toHaveLength(4);
    expect(seatOf(next.state, 1).hand).toHaveLength(4);
    expect(promptOf(next.state)).toMatchObject({ kind: 'mulligan', seat: chooser });
  });

  it('lets the chooser hand the first turn to the opponent', () => {
    const run = started();
    const chooser = run.state.turnOrderChooser!;
    const prompt = promptOf(run.state);
    const next = must(run, {
      seat: chooser,
      intent: {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'turnOrder', goFirst: false },
      },
    });
    expect(next.state.first).toBe(opponentOf(chooser));
    expect(promptOf(next.state)).toMatchObject({ kind: 'mulligan', seat: opponentOf(chooser) });
  });

  it('offers each seat one mulligan, first player first', () => {
    let run = must(started(), defaultAnswer(promptOf(started().state)));
    const first = run.state.first!;
    const handBefore = seatOf(run.state, first).hand;

    const prompt = promptOf(run.state);
    run = must(run, {
      seat: first,
      intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'mulligan', redraw: true } },
    });

    const firstSeatState = seatOf(run.state, first);
    expect(firstSeatState.hand).toHaveLength(4);
    expect(firstSeatState.hand.some((card) => handBefore.includes(card))).toBe(false);
    expect(firstSeatState.deck).toHaveLength(42 - 4);
    expect(firstSeatState.deck.slice(-4)).toEqual(handBefore); // old hand went to the bottom
    expect(promptOf(run.state)).toMatchObject({ kind: 'mulligan', seat: opponentOf(first) });
  });

  it('starts with 0/3 evolution points, 1 super evolution point and 0 play points', () => {
    const { state } = atFirstMainPhase();
    const first = state.first!;
    expect(seatOf(state, first).resources.evolutionPoints).toBe(0);
    expect(seatOf(state, opponentOf(first)).resources.evolutionPoints).toBe(3);
    expect(seatOf(state, 0).resources.superEvolutionPoints).toBe(1);
    expect(seatOf(state, 1).resources.superEvolutionPoints).toBe(1);
    expect(seatOf(state, opponentOf(first)).resources.playPoints).toBe(0);
  });
});

describe('turn structure (CR 7)', () => {
  it('gives the first player 1 play point and no draw on their first turn (7.2.4.1)', () => {
    const { state } = atFirstMainPhase();
    const first = state.first!;
    expect(state).toMatchObject({ turn: 1, active: first, phase: 'main' });
    expect(promptOf(state)).toMatchObject({ kind: 'main', seat: first });

    const mine = seatOf(state, first);
    expect(mine.hand).toHaveLength(4);
    expect(mine.resources).toMatchObject({ playPoints: 1, maxPlayPoints: 1, turnsPassed: 1 });
  });

  it('draws for the second player and passes the turn after the end phase', () => {
    const second = toNextTurn(atFirstMainPhase());
    const { state } = second;
    const first = state.first!;
    expect(state).toMatchObject({ turn: 2, active: opponentOf(first) });
    expect(seatOf(state, opponentOf(first)).hand).toHaveLength(5);
    expect(seatOf(state, opponentOf(first)).resources).toMatchObject({
      playPoints: 1,
      maxPlayPoints: 1,
      turnsPassed: 1,
    });
  });

  it('draws every turn after the first, and grows max play points by one up to ten', () => {
    const run = playUntil(
      atFirstMainPhase(),
      (state) => state.turn >= 24 && state.prompt?.kind === 'main',
    );
    for (const seat of [0, 1] as const) {
      expect(seatOf(run.state, seat).resources.maxPlayPoints).toBe(10);
    }
    const maxima = run.events.flatMap((event) =>
      event.type === 'resourceChanged' && event.resource === 'maxPlayPoints' ? [event.value] : [],
    );
    expect(Math.max(...maxima)).toBe(10);
    expect(maxima.slice(0, 4)).toEqual([1, 1, 2, 2]);
  });

  it('only asks the active player anything during a plain turn', () => {
    const run = atFirstMainPhase();
    const prompt = promptOf(run.state);
    expect(prompt.seat).toBe(run.state.active);
    // After passing with a small hand nothing else is needed: the next prompt is the next main phase.
    const next = must(run, { seat: prompt.seat, intent: { type: 'pass', promptId: prompt.id } });
    expect(promptOf(next.state)).toMatchObject({ kind: 'main', seat: opponentOf(prompt.seat) });
  });

  it('makes the active player discard down to seven, and only then', () => {
    // The second player draws on every turn (2, 4, 6, 8) and is the first to reach eight cards.
    const run = playUntil(atFirstMainPhase(), (state) => state.prompt?.kind === 'discard');
    const first = opponentOf(run.state.first!);
    const prompt = promptOf(run.state);

    expect(run.state.turn).toBe(8);
    expect(prompt).toMatchObject({ kind: 'discard', seat: first, count: 1 });
    expect(seatOf(run.state, first).hand).toHaveLength(8);
    expect(run.state.phase).toBe('end');
    // Nothing was discarded before the prompt was needed.
    expect(run.events.some((event) => event.type === 'cardsDiscarded')).toBe(false);

    if (prompt.kind !== 'discard') throw new Error('unreachable');
    const chosen = prompt.candidates[3]!;
    const after = must(run, {
      seat: first,
      intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'discard', cards: [chosen] } },
    });
    expect(seatOf(after.state, first).hand).toHaveLength(7);
    expect(seatOf(after.state, first).cemetery).toEqual([chosen]);
    expect(promptOf(after.state)).toMatchObject({ kind: 'main', seat: run.state.first });
  });

  it('discards for the player when every card in hand is a copy of the same card', () => {
    const run = atFirstMainPhase();
    const seat = run.state.active!;
    const mine = seatOf(run.state, seat);
    const hand = [...mine.hand, ...mine.deck.slice(0, 4)]; // eight cards
    const sameDef = (run.state.cards[hand[0]!] as { def: CardDefId }).def;

    const crafted: MatchState = setSeat(
      {
        ...run.state,
        cards: {
          ...run.state.cards,
          ...Object.fromEntries(
            hand.map((id) => [id, { ...(run.state.cards[id] as object), def: sameDef }]),
          ),
        },
      },
      seat,
      { hand, deck: mine.deck.slice(4) },
    );

    const result = reduce(crafted, defaultAnswer(promptOf(crafted)));
    if (!result.ok) throw new Error(result.reason);
    expect(seatOf(result.state, seat).hand).toHaveLength(7);
    expect(result.events.some((event) => event.type === 'cardsDiscarded')).toBe(true);
    // No discard prompt was needed: the next thing asked is the opponent's main phase.
    expect(promptOf(result.state)).toMatchObject({ kind: 'main', seat: opponentOf(seat) });
  });
});

describe('Ward (CR 7.4.3, 12.8)', () => {
  const withWard = (run: Run): { run: Run; ward: CardId; seat: Seat } => {
    const seat = run.state.active!;
    const ward = asCardId('ward-1');
    const def = testCatalog(WARD_FOLLOWER);
    if (!def) throw new Error('missing ward fixture');
    const state = setSeat(
      {
        ...run.state,
        defs: { ...run.state.defs, [def.id]: def },
        cards: { ...run.state.cards, [ward]: { id: ward, def: def.id, owner: seat } },
      },
      seat,
      { field: [fieldCard(ward, 'reserved', 0)] },
    );
    return { run: { ...run, state }, ward, seat };
  };

  it('asks about engaging a reserved Ward follower, and only the owner', () => {
    const { run, ward, seat } = withWard(atFirstMainPhase());
    const pass = defaultAnswer(promptOf(run.state));
    const after = must(run, pass);

    expect(promptOf(after.state)).toMatchObject({ kind: 'engageWards', seat, candidates: [ward] });
  });

  it('engages the chosen followers and refreshes them at the next start phase', () => {
    const { run, ward, seat } = withWard(atFirstMainPhase());
    let next = must(run, defaultAnswer(promptOf(run.state)));
    const prompt = promptOf(next.state);
    next = must(next, {
      seat,
      intent: { type: 'engageWards', promptId: prompt.id, cards: [ward] },
    });
    expect(seatOf(next.state, seat).field[0]?.placement).toBe('engaged');

    next = playUntil(next, (state) => state.turn === 3 && state.prompt?.kind === 'main');
    expect(seatOf(next.state, seat).field[0]?.placement).toBe('reserved');
  });

  it('accepts engaging none, and refuses cards that are not candidates', () => {
    const { run, ward, seat } = withWard(atFirstMainPhase());
    const next = must(run, defaultAnswer(promptOf(run.state)));
    const prompt = promptOf(next.state);

    const stranger = seatOf(next.state, seat).hand[0]!;
    const bad = reduce(next.state, {
      seat,
      intent: { type: 'engageWards', promptId: prompt.id, cards: [stranger] },
    });
    expect(bad).toMatchObject({ ok: false, reason: 'invalidAnswer' });
    const dup = reduce(next.state, {
      seat,
      intent: { type: 'engageWards', promptId: prompt.id, cards: [ward, ward] },
    });
    expect(dup).toMatchObject({ ok: false, reason: 'invalidAnswer' });

    const none = must(next, {
      seat,
      intent: { type: 'engageWards', promptId: prompt.id, cards: [] },
    });
    expect(seatOf(none.state, seat).field[0]?.placement).toBe('reserved');
    expect(promptOf(none.state)).toMatchObject({ kind: 'main', seat: opponentOf(seat) });
  });
});

describe('rejecting intents', () => {
  const run = atFirstMainPhase();
  const prompt = promptOf(run.state);
  const active = prompt.seat;

  const rejected = (action: Action) => {
    const result = reduce(run.state, action);
    if (result.ok) throw new Error('Expected a rejection');
    expect(result.state).toBe(run.state); // rewound: the very same state, not a copy
    expect(result.events).toEqual([]);
    return result.reason;
  };

  it('refuses answers from the wrong seat', () => {
    expect(
      rejected({ seat: opponentOf(active), intent: { type: 'pass', promptId: prompt.id } }),
    ).toBe('notYourPrompt');
  });

  it('refuses answers to a prompt that is not the open one', () => {
    expect(rejected({ seat: active, intent: { type: 'pass', promptId: prompt.id - 1 } })).toBe(
      'stalePrompt',
    );
    expect(rejected({ seat: active, intent: { type: 'pass', promptId: prompt.id + 1 } })).toBe(
      'stalePrompt',
    );
  });

  it('refuses intents that do not answer this prompt', () => {
    expect(
      rejected({
        seat: active,
        intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'mulligan', redraw: true } },
      }),
    ).toBe('invalidAnswer');
    expect(
      rejected({ seat: active, intent: { type: 'engageWards', promptId: prompt.id, cards: [] } }),
    ).toBe('invalidAnswer');
  });

  it('refuses answers when nothing is waiting', () => {
    const over = must(run, { seat: 0, intent: { type: 'concede' } });
    const result = reduce(over.state, {
      seat: active,
      intent: { type: 'pass', promptId: prompt.id },
    });
    expect(result).toMatchObject({ ok: false, reason: 'gameOver' });
  });

  it('validates discard choices: count, membership, duplicates', () => {
    const atDiscard = playUntil(run, (state) => state.prompt?.kind === 'discard');
    const open = promptOf(atDiscard.state);
    if (open.kind !== 'discard') throw new Error('unreachable');
    const seat = open.seat;
    const attempt = (cards: CardId[]) =>
      reduce(atDiscard.state, {
        seat,
        intent: { type: 'choose', promptId: open.id, choice: { kind: 'discard', cards } },
      });

    const [a, b] = open.candidates as [CardId, CardId];
    expect(attempt([])).toMatchObject({ ok: false, reason: 'invalidAnswer' });
    expect(attempt([a, b])).toMatchObject({ ok: false, reason: 'invalidAnswer' });
    expect(attempt([asCardId('nope')])).toMatchObject({ ok: false, reason: 'invalidAnswer' });
    const opponentCard = seatOf(atDiscard.state, opponentOf(seat)).hand[0]!;
    expect(attempt([opponentCard])).toMatchObject({ ok: false, reason: 'invalidAnswer' });
    expect(attempt([a])).toMatchObject({ ok: true });
  });
});

describe('conceding (CR 1.2.1)', () => {
  it('ends the game at once for the conceding seat, whoever is being asked', () => {
    const run = atFirstMainPhase();
    const waiting = promptOf(run.state).seat;
    const conceder = opponentOf(waiting);

    const over = must(run, { seat: conceder, intent: { type: 'concede' } });
    expect(over.state.outcome).toEqual({ winner: waiting, reason: 'concession' });
    expect(over.state.prompt).toBeNull();
    expect(over.state.step).toBe('over');
  });

  it('works before the game has started', () => {
    const over = must(started(), { seat: 1, intent: { type: 'concede' } });
    expect(over.state.outcome).toEqual({ winner: 0, reason: 'concession' });
  });
});

describe('losing the game (CR 11.2)', () => {
  const crafted = (patch: (state: MatchState) => MatchState): Transcript =>
    new Transcript(patch(atFirstMainPhase().state));

  it('loses when a draw is required from an empty deck', () => {
    const run = atFirstMainPhase();
    const first = run.state.first!;
    const second = opponentOf(first);
    const emptied = { ...run, state: setSeat(run.state, second, { deck: [] }) };

    const over = must(emptied, defaultAnswer(promptOf(emptied.state)));
    expect(over.state.outcome).toEqual({ winner: first, reason: 'deckOut' });
    expect(over.state.prompt).toBeNull();
  });

  it('loses when leader defense reaches zero', () => {
    const t = crafted((state) =>
      setSeat(state, 1, { leader: { ...state.seats[1].leader, defense: 0 } }),
    );
    confirmationTiming(t);
    expect(t.state.outcome).toEqual({ winner: 0, reason: 'leaderDefeated' });
  });

  it('draws the game when both players lose at the same time (1.2.2)', () => {
    const t = crafted((state) =>
      setSeat(setSeat(state, 0, { drewFromEmptyDeck: true }), 1, { drewFromEmptyDeck: true }),
    );
    confirmationTiming(t);
    expect(t.state.outcome).toEqual({ winner: null, reason: 'deckOut' });
  });

  it('does nothing when nobody has lost', () => {
    const t = crafted((state) => state);
    const before = t.state;
    confirmationTiming(t);
    expect(t.state).toBe(before);
    expect(t.events).toEqual([]);
  });
});

describe('purity and replay', () => {
  it('never mutates the state it is given', () => {
    const freeze = <T>(value: T): T => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
      return value;
    };
    let state = freeze(atFirstMainPhase().state);
    for (let i = 0; i < 40 && !state.outcome; i++) {
      const result = reduce(state, defaultAnswer(promptOf(state)));
      if (!result.ok) throw new Error(result.reason);
      state = freeze(result.state);
    }
    expect(state.turn).toBeGreaterThan(10);
  });

  it('rebuilds the exact state from its event log', () => {
    const run = playUntil(atFirstMainPhase('replay'), (state) => state.turn >= 12);
    expect(replay(run.events)).toEqual(run.state);
    expect(run.state.seq).toBe(run.events.length);
  });

  it('plays the same match twice from the same seed and answers', () => {
    const play = () => playUntil(started('twin'), (state) => state.turn >= 12);
    expect(play().events).toEqual(play().events);
  });

  it('plays a different match from a different seed', () => {
    const play = (seed: string) => playUntil(started(seed), (state) => state.turn >= 3);
    expect(play('one').state.seats[0].hand).not.toEqual(play('two').state.seats[0].hand);
  });

  it('rejects a log that does not begin with matchCreated', () => {
    expect(() => replay([])).toThrow(/matchCreated/);
  });
});
