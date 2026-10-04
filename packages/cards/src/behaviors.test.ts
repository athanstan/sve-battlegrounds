import { describe, expect, it } from 'vitest';
import { fairyCircle } from './forestcraft/fairy-circle';
import { feyboltArcher } from './forestcraft/feybolt-archer';
import { sevenMoreCentimeters } from './abysscraft/7-more-centimeters';
import { trialInitiation } from './swordcraft/trial-initiation';
import { chevalGrandEvolved } from './runecraft/cheval-grand';
import { daiwaScarlet } from './runecraft/daiwa-scarlet';
import { piercyeQueenOfFrost } from './forestcraft/piercye-queen-of-frost';
import { piousFlameHeavensScorcher } from './dragoncraft/pious-flame-heavens-scorcher';
import { titaniaSSanctuary } from './forestcraft/titania-s-sanctuary';
import { aSuperSuccessfulEvent } from './neutral/a-super-successful-event';
import { nahtnaughtCursedQueen } from './swordcraft/nahtnaught-cursed-queen';
import { tyrantSOrder } from './swordcraft/tyrant-s-order';
import { unbridledFury } from './swordcraft/unbridled-fury';
import { deckListOf, fixtureCatalog, uniqueFixtureCards } from './fixture-data';
import { ALL_SCRIPTS, scriptFor } from './registry';
import { createMatch, reduce, type MatchState, type Prompt } from '@sve/rules';

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
  it('has a script for every unique live key', () => {
    const keys = new Set(ALL_SCRIPTS.map((script) => script.key));
    expect([...ALL_SCRIPTS.map((script) => script.key)].sort()).toEqual([...keys].sort());
    expect(
      uniqueFixtureCards()
        .map((card) => card.key)
        .filter((key) => !keys.has(key)),
    ).toEqual([]);
  });

  it('scripts Fairy Circle as three Fairies to EX', () => {
    expect(fairyCircle.abilities).toEqual([
      { kind: 'spell', key: 'spell', effect: [{ op: 'token', name: 'Fairy', n: 3, to: 'ex' }] },
    ]);
  });

  it('scripts Feybolt Archer as a Fairy plus look-top-3', () => {
    const fanfare = feyboltArcher.abilities.find((ability) => ability.kind === 'triggered');
    expect(fanfare).toMatchObject({ on: 'fanfare' });
    expect(fanfare?.kind === 'triggered' ? fanfare.effect[1] : undefined).toMatchObject({
      op: 'lookTop',
      n: 3,
      rest: 'bottom',
    });
  });

  it('scripts Daiwa Scarlet as a filtered deck search and a first-spell discount', () => {
    const fanfare = daiwaScarlet.abilities.find(
      (ability) => ability.kind === 'triggered' && ability.key === 'fanfare',
    );
    expect(fanfare).toMatchObject({
      effect: [{ op: 'search', filter: { kind: ['spell'], universe: 'Umamusume' }, reveal: true }],
    });
  });

  it("scripts Titania's Sanctuary, Piercye, Trial Initiation, Cheval Grand, Pious Flame, and 7 More Centimeters", () => {
    expect(titaniaSSanctuary.abilities.some((ability) => ability.kind === 'static')).toBe(true);
    expect(piercyeQueenOfFrost.abilities[0]).toMatchObject({ on: 'fanfare' });
    expect(trialInitiation.abilities[0]).toMatchObject({ kind: 'spell' });
    expect(
      chevalGrandEvolved.abilities.some(
        (ability) => ability.kind === 'triggered' && ability.perTurn === 2,
      ),
    ).toBe(true);
    expect(piousFlameHeavensScorcher.abilities[0]).toMatchObject({
      kind: 'spell',
      extraCost: { reduceBy: 2 },
    });
    expect(sevenMoreCentimeters.abilities[0]).toMatchObject({ kind: 'static' });
  });

  it('scripts evolved Carrot spells with a 10-copy limit', () => {
    expect(aSuperSuccessfulEvent.alsoNamed).toEqual(['Carrot']);
    expect(aSuperSuccessfulEvent.copyLimit).toBe(10);
  });

  it("scripts Nahtnaught, Tyrant's Order, and Unbridled Fury", () => {
    expect(nahtnaughtCursedQueen.abilities).toMatchObject([
      { kind: 'triggered', on: 'fanfare' },
      { kind: 'activated', perTurn: 1 },
    ]);
    expect(tyrantSOrder.abilities[0]).toMatchObject({
      kind: 'spell',
      effect: [{ op: 'select', filter: { boxed: true } }, { op: 'destroy' }, { op: 'search' }],
    });
    expect(unbridledFury.abilities[0]).toMatchObject({ kind: 'spell' });
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
