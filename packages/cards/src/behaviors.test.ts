import { createMatch, reduce, type MatchState, type Prompt } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { fairyCircle } from './forestcraft/fairy-circle';
import { feyboltArcher } from './forestcraft/feybolt-archer';
import { sevenMoreCentimeters } from './umamusume/seven-more-centimeters';
import { trialInitiation } from './umamusume/trial-initiation';
import { spinaria } from './forestcraft/spinaria';
import { chevalGrandEvolved } from './umamusume/cheval-grand';
import { daiwaScarlet } from './umamusume/daiwa-scarlet';
import { piercye } from './forestcraft/piercye';
import { deckListOf, fixtureCatalog } from './fixture-data';
import { scriptFor } from './registry';

const start = (seed: string) =>
  createMatch({
    seed,
    catalog: fixtureCatalog(),
    scripts: scriptFor,
    players: [{ deck: deckListOf('940') }, { deck: deckListOf('909') }],
  });

const promptOf = (state: MatchState): Prompt => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

const answer = (state: MatchState) => {
  const prompt = promptOf(state);
  switch (prompt.kind) {
    case 'turnOrder':
      return {
        seat: prompt.seat,
        intent: {
          type: 'choose' as const,
          promptId: prompt.id,
          choice: { kind: 'turnOrder' as const, goFirst: true },
        },
      };
    case 'mulligan':
      return {
        seat: prompt.seat,
        intent: {
          type: 'choose' as const,
          promptId: prompt.id,
          choice: { kind: 'mulligan' as const, redraw: prompt.seat !== state.first },
        },
      };
    default:
      return { seat: prompt.seat, intent: { type: 'pass' as const, promptId: prompt.id } };
  }
};

function toMain(seed: string): MatchState {
  let state = start(seed).state;
  for (let n = 0; n < 20; n++) {
    if (state.prompt?.kind === 'main') return state;
    if (!state.prompt || state.outcome) break;
    const result = reduce(state, answer(state));
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  throw new Error('Did not reach main');
}

describe('per-card behaviour', () => {
  it('scripts Fairy Circle as a token-to-EX spell', () => {
    expect(fairyCircle.abilities).toEqual([
      { kind: 'spell', key: 'spell', effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'ex' }] },
    ]);
  });

  it('scripts Feybolt Archer as look-top-3 after a Fairy token', () => {
    const fanfare = feyboltArcher.abilities.find((ability) => ability.kind === 'triggered');
    expect(fanfare).toMatchObject({ on: 'fanfare' });
    expect(fanfare?.kind === 'triggered' ? fanfare.effect[1] : undefined).toMatchObject({
      op: 'lookTop',
      n: 3,
    });
  });

  it('scripts Daiwa Scarlet as a filtered deck search', () => {
    const fanfare = daiwaScarlet.abilities.find(
      (ability) => ability.kind === 'triggered' && ability.key === 'fanfare',
    );
    expect(fanfare).toMatchObject({
      effect: [{ op: 'search', filter: { kind: ['spell'], universe: 'Umamusume' }, reveal: true }],
    });
  });

  it('scripts Aria evolved, Piercye, Spinaria, C.C., Trial Initiation, Cheval Grand, and 7 More Centimeters', () => {
    expect(piercye.abilities[0]).toMatchObject({ effect: [{ op: 'evolveSelf' }] });
    expect(spinaria.abilities[0]).toMatchObject({
      effect: [{ op: 'select' }, { op: 'move', to: 'ex', costDeltaThisTurn: -2 }],
    });
    expect(trialInitiation.abilities[0]).toMatchObject({ kind: 'spell' });
    expect(
      chevalGrandEvolved.abilities.some(
        (ability) => ability.kind === 'triggered' && ability.perTurn === 2,
      ),
    ).toBe(true);
    expect(sevenMoreCentimeters.abilities[0]).toMatchObject({ kind: 'static' });
  });

  it('does not offer 7 More Centimeters on turn 1', () => {
    const state = toMain('7mc-gate');
    const prompt = promptOf(state);
    if (prompt.kind !== 'main') throw new Error('unreachable');
    const seven = Object.values(state.defs).find((def) => def.name === '7 More Centimeters');
    const plays = prompt.options.filter((option) => option.type === 'play');
    expect(
      plays.some((option) => option.type === 'play' && state.cards[option.card]?.def === seven?.id),
    ).toBe(false);
  });
});
