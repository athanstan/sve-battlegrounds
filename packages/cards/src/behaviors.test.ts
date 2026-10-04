import { describe, expect, it } from 'vitest';
import { fairyCircle } from './forestcraft/fairy-circle';
import { blessedFairyDancer } from './forestcraft/blessed-fairy-dancer';
import { feyboltArcher } from './forestcraft/feybolt-archer';
import { sevenMoreCentimeters } from './abysscraft/7-more-centimeters';
import { trialInitiation } from './swordcraft/trial-initiation';
import { chevalGrandEvolved } from './runecraft/cheval-grand';
import { daiwaScarlet } from './runecraft/daiwa-scarlet';
import { mrBertrandMagicMentor } from './runecraft/mr-bertrand-magic-mentor';
import { mysterianKnowledge } from './runecraft/mysterian-knowledge';
import { mysterianMissile } from './runecraft/mysterian-missile';
import { dimensionShift } from './runecraft/dimension-shift';
import { storyOfALifetime } from './runecraft/story-of-a-lifetime';
import { chainLightning } from './runecraft/chain-lightning';
import { yukishimaMasterBiographer } from './runecraft/yukishima-master-biographer';
import { dariaInfinityWitch } from './runecraft/daria-infinity-witch';
import { truthSAdjudication } from './runecraft/truth-s-adjudication';
import { piercyeQueenOfFrost } from './forestcraft/piercye-queen-of-frost';
import { piousFlameHeavensScorcher } from './dragoncraft/pious-flame-heavens-scorcher';
import { titaniaSSanctuary } from './forestcraft/titania-s-sanctuary';
import { aSuperSuccessfulEvent } from './neutral/a-super-successful-event';
import { nahtnaughtCursedQueen } from './swordcraft/nahtnaught-cursed-queen';
import { tyrantSOrder } from './swordcraft/tyrant-s-order';
import { unbridledFury } from './swordcraft/unbridled-fury';
import { deckListOf, fixtureCatalog, uniqueFixtureCards } from './fixture-data';
import { ALL_SCRIPTS, scriptFor } from './registry';
import {
  asCardDefId,
  asCardId,
  createMatch,
  project,
  reduce,
  seatViewer,
  type CardDefinition,
  type Intent,
  type MatchState,
  type Prompt,
} from '@sve/rules';

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

const catalogDef = (id: string): CardDefinition => {
  const found = fixtureCatalog()(asCardDefId(id));
  if (!found) throw new Error(`catalog missing ${id}`);
  return found;
};

function put(
  state: MatchState,
  def: CardDefinition,
  zone: 'hand' | 'cemetery',
  id: string,
): MatchState {
  const seat = state.active!;
  const card = asCardId(id);
  const script = scriptFor(def);
  const current = state.seats[seat];
  const nextSeat = {
    ...current,
    [zone]: [...current[zone], card],
    resources:
      zone === 'hand'
        ? { ...current.resources, playPoints: Math.max(current.resources.playPoints, def.cost) }
        : current.resources,
  };
  const seats =
    seat === 0 ? ([nextSeat, state.seats[1]] as const) : ([state.seats[0], nextSeat] as const);
  const prompt = state.prompt;
  const play =
    zone === 'hand' && prompt?.kind === 'main'
      ? { type: 'play' as const, card, cost: def.cost, from: 'hand' as const }
      : null;
  return {
    ...state,
    defs: { ...state.defs, [def.id]: def },
    scripts: script ? { ...state.scripts, [def.id]: script } : state.scripts,
    cards: { ...state.cards, [card]: { id: card, def: def.id, owner: seat, token: false } },
    seats,
    prompt:
      play && prompt?.kind === 'main' ? { ...prompt, options: [...prompt.options, play] } : prompt,
  };
}

function act(state: MatchState, intent: (promptId: number) => Intent): MatchState {
  const prompt = promptOf(state);
  const result = reduce(state, { seat: prompt.seat, intent: intent(prompt.id) });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function playBertrand(seed: string, cemetery: readonly string[], mode: '0' | '1'): MatchState {
  let state = toMain(seed);
  cemetery.forEach((id, n) => {
    state = put(state, catalogDef(id), 'cemetery', `grave-${n}`);
  });
  state = put(state, catalogDef('2778'), 'hand', 'bertrand');
  state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('bertrand') }));
  expect(promptOf(state).kind).toBe('chooseMode');
  return act(state, (promptId) => ({
    type: 'choose',
    promptId,
    choice: { kind: 'mode', id: mode },
  }));
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

  it("gives Blessed Fairy Dancer's +1/+1 to a Fairy token in EX and keeps it when played", () => {
    expect(blessedFairyDancer.abilities).toMatchObject([
      {
        kind: 'triggered',
        on: 'fanfare',
        effect: [
          { op: 'buff', cards: { each: { zone: 'field', who: 'you' } } },
          { op: 'buff', cards: { each: { zone: 'ex', who: 'you' } } },
        ],
      },
    ]);

    let state = toMain('dancer-ex-fairy');
    const seat = state.active!;
    const proto = state.tokens.Fairy;
    if (!proto) throw new Error('missing Fairy token');
    const fairy = asCardId('ex-fairy');
    const current = state.seats[seat];
    state = {
      ...state,
      cards: {
        ...state.cards,
        [fairy]: { id: fairy, def: proto.id, owner: seat, token: true },
      },
      seats:
        seat === 0
          ? [{ ...current, ex: [...current.ex, fairy] }, state.seats[1]]
          : [state.seats[0], { ...current, ex: [...current.ex, fairy] }],
    };
    state = put(state, catalogDef('1865'), 'hand', 'dancer');
    const withPoints: MatchState = {
      ...state,
      seats:
        seat === 0
          ? [
              {
                ...state.seats[0],
                resources: { ...state.seats[0].resources, playPoints: 4, maxPlayPoints: 4 },
              },
              state.seats[1],
            ]
          : [
              state.seats[0],
              {
                ...state.seats[1],
                resources: { ...state.seats[1].resources, playPoints: 4, maxPlayPoints: 4 },
              },
            ],
    };
    state = act(withPoints, (promptId) => ({
      type: 'play',
      promptId,
      card: asCardId('dancer'),
    }));
    expect(state.cards[fairy]?.modifiers).toEqual([{ attack: 1, defense: 1, until: null }]);
    expect(
      project(state, seatViewer(seat)).seats[seat].ex.find((entry) => entry.card.id === fairy)
        ?.shown,
    ).toEqual({ attack: 2, defense: 2, keywords: [] });

    const main = promptOf(state);
    if (main.kind !== 'main') throw new Error('expected main');
    const playFairy = main.options.find(
      (option) => option.type === 'play' && option.card === fairy,
    );
    expect(playFairy).toBeDefined();
    state = act(state, (promptId) => ({ type: 'play', promptId, card: fairy }));
    expect(state.seats[seat].field.find((card) => card.id === fairy)?.shown).toEqual({
      attack: 2,
      defense: 2,
      keywords: [],
    });
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

  it('scripts Mr. Bertrand as a choose-one fanfare that mints Missile or returns an Academic spell', () => {
    expect(mrBertrandMagicMentor.abilities).toMatchObject([
      {
        kind: 'triggered',
        on: 'fanfare',
        effect: [
          {
            op: 'chooseOne',
            options: [
              { effect: [{ op: 'token', name: 'Mysterian Missile', n: 1, to: 'ex' }] },
              {
                effect: [
                  { op: 'select', filter: { kind: ['spell'], trait: 'Academic' }, count: 1 },
                  {
                    op: 'if',
                    cond: { atLeast: 5, value: { filter: { trait: 'Academic' } } },
                    then: [{ op: 'move', cards: 'spell', to: 'hand' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(mysterianMissile.abilities).toMatchObject([
      {
        kind: 'spell',
        effect: [
          { op: 'select', filter: { kind: ['follower'] }, target: true },
          { op: 'damage', amount: 3 },
          {
            op: 'if',
            cond: { atLeast: 10 },
            then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
          },
        ],
      },
    ]);
  });

  it('lets Bertrand put a Mysterian Missile into EX or return an Academic spell at 5 cemetery Academics', () => {
    const missile = playBertrand('bertrand-missile', [], '0');
    const seat = missile.active!;
    expect(
      missile.seats[seat].ex.some(
        (id) => missile.defs[missile.cards[id]!.def]?.name === 'Mysterian Missile',
      ),
    ).toBe(true);

    const academics = ['1698', '1698', '1698', '2768', '2771'];
    const recovered = playBertrand('bertrand-return', academics, '1');
    const recoveredPrompt = promptOf(recovered);
    expect(recoveredPrompt.kind).toBe('selectCards');
    if (recoveredPrompt.kind !== 'selectCards') throw new Error('unreachable');
    const spell = recoveredPrompt.candidates[0]!;
    const afterPick = act(recovered, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [spell] },
    }));
    expect(afterPick.seats[afterPick.active!].hand).toContain(spell);
    expect(afterPick.seats[afterPick.active!].cemetery).not.toContain(spell);

    const short = playBertrand('bertrand-short', academics.slice(1), '1');
    const shortPrompt = promptOf(short);
    expect(shortPrompt.kind).toBe('selectCards');
    if (shortPrompt.kind !== 'selectCards') throw new Error('unreachable');
    const kept = shortPrompt.candidates[0]!;
    const afterKeep = act(short, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [kept] },
    }));
    expect(afterKeep.seats[afterKeep.active!].cemetery).toContain(kept);
    expect(afterKeep.seats[afterKeep.active!].hand).not.toContain(kept);
  });

  it('plays Mysterian Knowledge by revealing two Academic cards, which stay in hand', () => {
    expect(mysterianKnowledge.abilities).toMatchObject([
      {
        kind: 'spell',
        additionalCost: { reveal: { n: 2, filter: { trait: 'Academic' } } },
        effect: [{ op: 'draw' }, { op: 'token', name: 'Mysterian Missile', to: 'ex' }],
      },
    ]);

    let state = toMain('knowledge-reveal');
    const seat = state.active!;
    state = put(state, catalogDef('1698'), 'hand', 'craig');
    state = put(state, catalogDef('2768'), 'hand', 'palla');
    state = put(state, catalogDef('2771'), 'hand', 'knowledge');
    const asked = act(state, (promptId) => ({
      type: 'play',
      promptId,
      card: asCardId('knowledge'),
    }));
    const prompt = promptOf(asked);
    expect(prompt.kind).toBe('selectCards');
    if (prompt.kind !== 'selectCards') throw new Error('unreachable');
    // The table highlights exactly these: Academic cards in hand, not the spell being played.
    expect(prompt.candidates).toEqual(expect.arrayContaining(['craig', 'palla']));
    expect(prompt.candidates).not.toContain('knowledge');
    for (const id of prompt.candidates) {
      expect(asked.defs[asked.cards[id]!.def]?.traits).toContain('Academic');
    }
    expect([prompt.min, prompt.max]).toEqual([2, 2]);

    let paid = act(asked, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('craig'), asCardId('palla')] },
    }));
    for (let n = 0; n < 10 && paid.prompt && paid.prompt.kind !== 'main'; n++) {
      paid = act(paid, (promptId) => ({ type: 'pass', promptId }));
    }
    expect(paid.seats[seat].hand).toEqual(expect.arrayContaining(['craig', 'palla']));
    expect(paid.seats[seat].cemetery).toContain('knowledge');
    expect(
      paid.seats[seat].ex.some(
        (id) => paid.defs[paid.cards[id]!.def]?.name === 'Mysterian Missile',
      ),
    ).toBe(true);
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

  it('scripts Why is crafter at 1: look-top, next-play discount, EX bounce, extra turn', () => {
    expect(dariaInfinityWitch.abilities).toMatchObject([
      { kind: 'triggered', on: 'fanfare', effect: [{ op: 'lookTop', n: 3, rest: 'bottom' }] },
      { kind: 'activated', cost: { engage: true } },
    ]);
    expect(yukishimaMasterBiographer.abilities).toMatchObject([
      { kind: 'triggered', on: 'fanfare', effect: [{ op: 'nextPlayCost', amount: -3 }] },
      { kind: 'triggered', on: { whenever: { type: 'played' } } },
    ]);
    expect(storyOfALifetime.abilities[0]).toMatchObject({ kind: 'spell' });
    expect(
      storyOfALifetime.abilities[0]?.kind === 'spell' && storyOfALifetime.abilities[0].effect[0],
    ).toMatchObject({ op: 'lookTop', n: 4, rest: 'bury' });
    expect(chainLightning.abilities).toMatchObject([
      { kind: 'static', validIn: ['ex'] },
      { kind: 'triggered', on: { at: 'startOfEndPhase', whose: 'yours' } },
      { kind: 'spell' },
    ]);
    expect(truthSAdjudication.abilities[0]).toMatchObject({ kind: 'spell' });
    expect(dimensionShift.abilities[0]).toMatchObject({
      kind: 'spell',
      extraCost: { reduceBy: 5, banish: { n: 10 } },
      effect: [{ op: 'extraTurn' }],
    });
  });
});
