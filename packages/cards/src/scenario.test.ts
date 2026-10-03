import {
  asCardId,
  createMatch,
  DEFAULT_TOKENS,
  reduce,
  type MatchState,
  type Prompt,
} from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { deckListOf, fixtureCatalog } from './fixture-data';
import { scriptFor } from './registry';

const catalog = fixtureCatalog();

const start = (seed: string) =>
  createMatch({
    seed,
    catalog,
    scripts: scriptFor,
    players: [{ deck: deckListOf('940') }, { deck: deckListOf('909') }],
  });

const promptOf = (state: MatchState): Prompt => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

function answerSetup(state: MatchState, firstRedraw: boolean) {
  const prompt = promptOf(state);
  switch (prompt.kind) {
    case 'turnOrder':
      return reduce(state, {
        seat: prompt.seat,
        intent: {
          type: 'choose',
          promptId: prompt.id,
          choice: { kind: 'turnOrder', goFirst: true },
        },
      });
    case 'mulligan': {
      const redraw = prompt.seat === state.first ? firstRedraw : !firstRedraw;
      return reduce(state, {
        seat: prompt.seat,
        intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'mulligan', redraw } },
      });
    }
    default:
      return reduce(state, { seat: prompt.seat, intent: { type: 'pass', promptId: prompt.id } });
  }
}

function toMain(seed: string, firstRedraw = true): MatchState {
  let state = start(seed).state;
  for (let n = 0; n < 20; n++) {
    if (state.prompt?.kind === 'main') return state;
    if (!state.prompt || state.outcome) break;
    const result = answerSetup(state, firstRedraw);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  throw new Error('Did not reach main');
}

function findPlay(name: string): { state: MatchState; card: ReturnType<typeof asCardId> } {
  for (let n = 0; n < 60; n++) {
    const state = toMain(`play-${name}-${n}`);
    const prompt = promptOf(state);
    if (prompt.kind !== 'main') continue;
    const play = prompt.options.find((option) => {
      if (option.type !== 'play') return false;
      const defId = state.cards[option.card]?.def;
      return defId !== undefined && state.defs[defId]?.name === name;
    });
    if (play?.type === 'play') return { state, card: play.card };
  }
  throw new Error(`No seed offered ${name}`);
}

describe('two-deck scenario checklist', () => {
  it('lets the first player redraw and the second keep, both ending with four cards', () => {
    let state = start('mull-mix').state;
    let firstOpening: readonly string[] | null = null;
    for (let n = 0; n < 8; n++) {
      if (
        state.prompt?.kind === 'mulligan' &&
        state.first !== null &&
        state.prompt.seat === state.first
      ) {
        firstOpening = [...state.seats[state.first].hand];
        break;
      }
      const result = answerSetup(state, true);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    }
    expect(firstOpening).not.toBeNull();
    const afterFirst = answerSetup(state, true);
    if (!afterFirst.ok) throw new Error(afterFirst.reason);
    state = afterFirst.state;
    if (state.first !== null && firstOpening) {
      expect(state.seats[state.first].hand).not.toEqual(firstOpening);
    }
    while (state.prompt && state.prompt.kind !== 'main' && !state.outcome) {
      const result = answerSetup(state, true);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    }
    expect(state.seats[0].hand).toHaveLength(4);
    expect(state.seats[1].hand).toHaveLength(4);
  });

  it('creates only the Fairies that fit into a nearly full EX area (CR 4.4.4.2)', () => {
    const { state, card } = findPlay('Fairy Circle');
    const prompt = promptOf(state);
    const seat = prompt.seat;
    const proto = state.tokens.Fairy ?? DEFAULT_TOKENS.Fairy;
    if (!proto) throw new Error('missing Fairy token prototype');
    const fillers = [0, 1, 2, 3].map((n) => asCardId(`${seat}:T${100 + n}`));
    const crafted: MatchState = {
      ...state,
      defs: { ...state.defs, [proto.id]: proto },
      cards: {
        ...state.cards,
        ...Object.fromEntries(
          fillers.map((id) => [id, { id, def: proto.id, owner: seat, token: true as const }]),
        ),
      },
      seats:
        seat === 0
          ? [
              {
                ...state.seats[0],
                ex: fillers,
                resources: { ...state.seats[0].resources, playPoints: 10 },
              },
              state.seats[1],
            ]
          : [
              state.seats[0],
              {
                ...state.seats[1],
                ex: fillers,
                resources: { ...state.seats[1].resources, playPoints: 10 },
              },
            ],
    };
    const result = reduce(crafted, { seat, intent: { type: 'play', promptId: prompt.id, card } });
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.seats[seat].ex).toHaveLength(5);
    expect(
      result.events.some((event) => event.type === 'tokenCreated' && event.cards.length === 1),
    ).toBe(true);
  });

  it('eliminates a token that left the field for the cemetery (CR 9.1.4)', () => {
    const state = toMain('token-out');
    const seat = state.active ?? 0;
    const proto = state.tokens.Fairy ?? DEFAULT_TOKENS.Fairy;
    if (!proto) throw new Error('missing Fairy token prototype');
    const token = asCardId(`${seat}:T200`);
    const crafted: MatchState = {
      ...state,
      defs: { ...state.defs, [proto.id]: proto },
      cards: { ...state.cards, [token]: { id: token, def: proto.id, owner: seat, token: true } },
      seats:
        seat === 0
          ? [{ ...state.seats[0], cemetery: [token, ...state.seats[0].cemetery] }, state.seats[1]]
          : [state.seats[0], { ...state.seats[1], cemetery: [token, ...state.seats[1].cemetery] }],
    };
    const prompt = promptOf(crafted);
    const result = reduce(crafted, {
      seat: prompt.seat,
      intent: { type: 'pass', promptId: prompt.id },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(
      result.events.some(
        (event) => event.type === 'tokenEliminated' && event.cards.includes(token),
      ),
    ).toBe(true);
    expect(result.state.seats[seat].cemetery.includes(token)).toBe(false);
  });
});
