import { describe, expect, it } from 'vitest';
import {
  asCardDefId,
  asCardId,
  createMatch,
  fieldCard,
  reduce,
  type CardDefinition,
  type CardId,
  type Intent,
  type MatchState,
} from '@sve/rules';
import { catalogCard, definitionOfPrinting } from './catalog';
import { deckListOf, fixtureCatalog } from './fixture-data';
import { scriptFor } from './registry';

const start = (seed: string) =>
  createMatch({
    seed,
    catalog: fixtureCatalog(),
    scripts: scriptFor,
    players: [{ deck: deckListOf('940') }, { deck: deckListOf('909') }],
  });

function toMain(seed: string): MatchState {
  let state = start(seed).state;
  for (let n = 0; n < 20; n++) {
    if (state.prompt?.kind === 'main') return state;
    if (!state.prompt || state.outcome) break;
    const prompt = state.prompt;
    const intent: Intent =
      prompt.kind === 'turnOrder'
        ? { type: 'choose', promptId: prompt.id, choice: { kind: 'turnOrder', goFirst: true } }
        : prompt.kind === 'mulligan'
          ? {
              type: 'choose',
              promptId: prompt.id,
              choice: { kind: 'mulligan', redraw: prompt.seat !== state.first },
            }
          : { type: 'pass', promptId: prompt.id };
    const result = reduce(state, { seat: prompt.seat, intent });
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
  }
  throw new Error('Did not reach main');
}

function cardOf(key: string): CardDefinition {
  const card = catalogCard(key);
  const printing = card?.printings[0];
  if (!card || !printing) throw new Error(`catalog missing ${key}`);
  return definitionOfPrinting(card, printing);
}

function act(state: MatchState, intent: (promptId: number) => Intent): MatchState {
  const prompt = state.prompt;
  if (!prompt) throw new Error('Expected an open prompt');
  const result = reduce(state, { seat: prompt.seat, intent: intent(prompt.id) });
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function install(
  state: MatchState,
  def: CardDefinition,
  id: string,
  zone: 'hand' | 'field' | 'cemetery' | 'ex' | 'deck',
  seat = state.active ?? 0,
): MatchState {
  const card = asCardId(id);
  const script = scriptFor(def);
  const current = state.seats[seat];
  const resources = { ...current.resources, playPoints: 10, maxPlayPoints: 10 };
  const next = {
    ...current,
    resources,
    hand: zone === 'hand' ? [...current.hand, card] : current.hand,
    cemetery: zone === 'cemetery' ? [...current.cemetery, card] : current.cemetery,
    ex: zone === 'ex' ? [...current.ex, card] : current.ex,
    deck: zone === 'deck' ? [card, ...current.deck] : current.deck,
    field:
      zone === 'field'
        ? [
            ...current.field,
            fieldCard(card, 'reserved', state.turn, {
              attack: def.attack ?? 0,
              defense: def.defense ?? 1,
              keywords: [...def.keywords],
            }),
          ]
        : current.field,
  };
  const prompt = state.prompt;
  const play =
    (zone === 'hand' || zone === 'ex') && prompt?.kind === 'main' && seat === prompt.seat
      ? {
          type: 'play' as const,
          card,
          cost: def.cost,
          from: zone === 'ex' ? ('ex' as const) : ('hand' as const),
        }
      : null;
  return {
    ...state,
    defs: { ...state.defs, [def.id]: def },
    scripts: script ? { ...state.scripts, [def.id]: script } : state.scripts,
    cards: {
      ...state.cards,
      [card]: { id: card, def: def.id, owner: seat, token: def.special === 'token' },
    },
    seats: seat === 0 ? [next, state.seats[1]] : [state.seats[0], next],
    prompt:
      play && prompt?.kind === 'main' ? { ...prompt, options: [...prompt.options, play] } : prompt,
  };
}

const nameOf = (state: MatchState, id: CardId): string => state.defs[state.cards[id]!.def]!.name;

const points = (state: MatchState): number => state.seats[state.active!].resources.playPoints;

describe('tournament-winner cards', () => {
  it('discounts Hokko by the Umamusume on your field', () => {
    let state = toMain('hokko-discount');
    const hokko = cardOf('hokko-tarumae');
    const uma = cardOf('sakura-bakushin-o');
    state = install(state, uma, 'uma-a', 'field');
    state = install(state, uma, 'uma-b', 'field');
    state = install(state, hokko, 'hokko', 'hand');
    const before = points(state);
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('hokko') }));
    expect(state.prompt?.kind).toBe('main');
    expect(before - points(state)).toBe(Math.max(0, hokko.cost - 2));
  });

  it('rejects a Friends Forever pair whose costs add up past 5', () => {
    let state = toMain('friends-budget');
    const pricey = cardOf('aenea-amethyst-rebel');
    const cheap = cardOf('roly-poly-mk-ii');
    expect(pricey.cost + cheap.cost).toBeGreaterThan(5);
    state = install(state, pricey, 'pricey', 'cemetery');
    state = install(state, cheap, 'cheap', 'cemetery');
    state = install(state, cardOf('friends-forever'), 'spell', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('spell') }));
    expect(state.prompt?.kind).toBe('selectCards');
    const prompt = state.prompt;
    if (prompt?.kind !== 'selectCards') throw new Error('expected a selection');
    const rejected = reduce(state, {
      seat: prompt.seat,
      intent: {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'selectCards', cards: [asCardId('pricey'), asCardId('cheap')] },
      },
    });
    expect(rejected.ok).toBe(false);
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('cheap')] },
    }));
    expect(state.seats[state.active!].field.some((card) => card.id === asCardId('cheap'))).toBe(
      true,
    );
  });

  it('has Apollo deal 1 to the enemy leader and each enemy follower', () => {
    let state = toMain('apollo-smite');
    const foe = cardOf('aenea-amethyst-rebel');
    const enemy = state.active === 0 ? 1 : 0;
    state = install(state, foe, 'foe', 'field', enemy);
    const beforeEnemy = state.seats[enemy].leader.defense;
    const beforeYou = state.seats[state.active!].leader.defense;
    state = install(state, cardOf('apollo-heaven-s-envoy'), 'apollo', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('apollo') }));
    expect(state.prompt?.kind).toBe('main');
    expect(state.seats[enemy].leader.defense).toBe(beforeEnemy - 1);
    expect(state.seats[state.active!].leader.defense).toBe(beforeYou);
    const struck = state.seats[enemy].field.find((card) => card.id === asCardId('foe'));
    expect(struck?.damageTaken).toBe(1);
  });

  it('has Garnet Waltz deal 2 to the enemy leader and 1 to yours', () => {
    let state = toMain('garnet-waltz');
    const enemy = state.active === 0 ? 1 : 0;
    const beforeEnemy = state.seats[enemy].leader.defense;
    const beforeYou = state.seats[state.active!].leader.defense;
    state = install(state, cardOf('garnet-waltz'), 'waltz', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('waltz') }));
    expect(state.prompt?.kind).toBe('chooseMode');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'mode', id: '0' },
    }));
    expect(state.seats[enemy].leader.defense).toBe(beforeEnemy - 2);
    expect(state.seats[state.active!].leader.defense).toBe(beforeYou - 1);
  });

  it("returns Nature's Guidance's target and draws", () => {
    let state = toMain('guidance');
    const seat = state.active!;
    const deck = state.seats[seat].deck.length;
    state = install(state, cardOf('windflower-tiger'), 'tiger', 'field');
    state = install(state, cardOf('nature-s-guidance'), 'guidance', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('guidance') }));
    expect(state.prompt?.kind).toBe('selectCards');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('tiger')] },
    }));
    expect(state.seats[seat].hand).toContain(asCardId('tiger'));
    expect(state.seats[seat].field.some((card) => card.id === asCardId('tiger'))).toBe(false);
    expect(state.seats[seat].deck.length).toBe(deck - 1);
  });

  it('discounts Salvia after a different Beast leaves the field for hand', () => {
    let state = toMain('salvia-discount');
    const salvia = cardOf('salvia-panther');
    state = install(state, cardOf('windflower-tiger'), 'tiger', 'field');
    state = install(state, cardOf('nature-s-guidance'), 'guidance', 'hand');
    state = install(state, salvia, 'salvia', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('guidance') }));
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('tiger')] },
    }));
    expect(state.prompt?.kind).toBe('main');
    const before = points(state);
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('salvia') }));
    expect(before - points(state)).toBe(Math.max(0, salvia.cost - 2));
  });

  it('summons an Assembly Droid and puts Repair Mode into the EX area', () => {
    let state = toMain('hoverboard');
    const seat = state.active!;
    state = install(state, cardOf('hoverboard-mercenary'), 'board', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('board') }));
    expect(state.prompt?.kind).toBe('main');
    expect(state.seats[seat].field.map((card) => nameOf(state, card.id))).toContain(
      'Assembly Droid',
    );
    expect(state.seats[seat].ex.map((id) => nameOf(state, id))).toContain('Repair Mode');
  });

  it('lets Roly-Poly Mk II keep a Machina and bury the rest', () => {
    let state = toMain('roly-look');
    const seat = state.active!;
    state = install(state, cardOf('alpha-drive'), 'top-spell', 'deck');
    state = install(state, cardOf('roly-poly-mk-i'), 'top-machina', 'deck');
    state = install(state, cardOf('roly-poly-mk-ii'), 'roly', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('roly') }));
    if (state.prompt?.kind === 'confirmOptional') {
      state = act(state, (promptId) => ({
        type: 'choose',
        promptId,
        choice: { kind: 'confirm', yes: false },
      }));
    }
    expect(state.prompt?.kind).toBe('selectCards');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('top-machina')] },
    }));
    expect(state.seats[seat].hand).toContain(asCardId('top-machina'));
    expect(state.seats[seat].cemetery).toContain(asCardId('top-spell'));
  });

  it('deals 2 with Cheshire when she was not played from hand', () => {
    let state = toMain('cheshire-ex');
    const enemy = state.active === 0 ? 1 : 0;
    state = install(state, cardOf('roly-poly-mk-ii'), 'foe', 'field', enemy);
    state = install(state, cardOf('cheshire-cat'), 'ches', 'ex');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('ches') }));
    expect(state.prompt?.kind).toBe('selectCards');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('foe')] },
    }));
    const struck = state.seats[enemy].field.find((card) => card.id === asCardId('foe'));
    expect(struck?.damageTaken).toBe(2);
  });

  it('gives the Mercenary that entered +1/+1 and Rush', () => {
    let state = toMain('chipper');
    const seat = state.active!;
    state = install(state, cardOf('chipper-skipper'), 'chipper', 'field');
    state = install(state, cardOf('hoverboard-mercenary'), 'board', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('board') }));
    expect(state.prompt?.kind).toBe('main');
    const board = state.seats[seat].field.find((card) => card.id === asCardId('board'));
    expect(board?.shown.attack).toBe(2);
    expect(board?.shown.defense).toBe(2);
    expect(board?.shown.keywords).toContain('rush');
  });

  it('puts a follower whose name contains Anastasia into the EX area at -3', () => {
    let state = toMain('minami');
    const anastasia = cardOf('anastasia');
    state = install(state, anastasia, 'ana', 'deck');
    state = install(state, cardOf('minami-nitta-water-s-edge-bride'), 'minami', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('minami') }));
    expect(state.prompt?.kind).toBe('selectCards');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('ana')] },
    }));
    expect(state.seats[state.active!].ex).toContain(asCardId('ana'));
    expect(state.costDeltas[asCardId('ana')]).toEqual([{ amount: -3, until: 'endOfTurn' }]);
  });

  it('caps Roly-Poly Mk I at 1 damage while Aenea is on that field', () => {
    let state = toMain('roly-cap');
    const enemy = state.active === 0 ? 1 : 0;
    state = install(state, cardOf('aenea-amethyst-rebel'), 'aenea', 'field', enemy);
    state = install(state, cardOf('roly-poly-mk-i'), 'roly', 'field', enemy);
    state = install(state, cardOf('cheshire-cat'), 'ches', 'ex');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('ches') }));
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('roly')] },
    }));
    const roly = state.seats[enemy].field.find((card) => card.id === asCardId('roly'));
    expect(roly?.damageTaken).toBe(1);
  });

  it('gives other Pixie followers +1/+1 on the field and in the EX area', () => {
    let state = toMain('dancer');
    const seat = state.active!;
    const fairy = state.tokens.Fairy;
    if (!fairy) throw new Error('missing Fairy token');
    state = install(state, fairy, 'fairy', 'field');
    state = install(state, fairy, 'ex-fairy', 'ex');
    state = install(state, cardOf('blessed-fairy-dancer'), 'dancer', 'hand');
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('dancer') }));
    expect(state.prompt?.kind).toBe('main');
    const onField = state.seats[seat].field.find((card) => card.id === asCardId('fairy'));
    expect(onField?.shown).toMatchObject({ attack: 2, defense: 2 });
    expect(state.cards[asCardId('ex-fairy')]?.modifiers).toEqual([
      { attack: 1, defense: 1, until: null },
    ]);
  });

  it('pins the PR reprint of Blessed Fairy Dancer that the daiwa deck actually plays', () => {
    const state = toMain('dancer-reprint-pin');
    const dancer = Object.values(state.defs).find((def) => def.key === 'blessed-fairy-dancer');
    expect(dancer?.id).toBe(asCardDefId('3368'));
    expect(state.scripts[dancer!.id]?.abilities[0]).toMatchObject({ on: 'fanfare' });
  });

  it('plays the Mage spell Grimoire put into the EX area for 3 less', () => {
    let state = toMain('grimoire');
    const seat = state.active!;
    const evolved = cardOf('grimoire-sorcerer@evolved');
    const evolvedScript = scriptFor(evolved);
    state = install(state, cardOf('grimoire-sorcerer'), 'grimoire', 'field');
    state = install(state, cardOf('magic-missile'), 'missile', 'hand');
    const evolveId = asCardId('grimoire-evo');
    const mine = state.seats[seat];
    const seated = { ...mine, evolveDeck: [...mine.evolveDeck, evolveId] };
    const prompt = state.prompt;
    if (prompt?.kind !== 'main') throw new Error('expected main');
    state = {
      ...state,
      defs: { ...state.defs, [evolved.id]: evolved },
      scripts: evolvedScript ? { ...state.scripts, [evolved.id]: evolvedScript } : state.scripts,
      cards: {
        ...state.cards,
        [evolveId]: { id: evolveId, def: evolved.id, owner: seat, token: false },
      },
      seats: seat === 0 ? [seated, state.seats[1]] : [state.seats[0], seated],
      prompt: {
        ...prompt,
        options: [
          ...prompt.options,
          {
            type: 'evolve',
            card: asCardId('grimoire'),
            cost: 1,
            superEvolve: false,
            useEvolutionPoint: false,
          },
        ],
      },
    };
    const before = state.seats[seat].resources.playPoints;
    state = act(state, (promptId) => ({
      type: 'evolve',
      promptId,
      card: asCardId('grimoire'),
      superEvolve: false,
      useEvolutionPoint: false,
    }));
    expect(state.prompt?.kind).toBe('selectCards');
    state = act(state, (promptId) => ({
      type: 'choose',
      promptId,
      choice: { kind: 'selectCards', cards: [asCardId('missile')] },
    }));
    expect(state.seats[seat].ex).toContain(asCardId('missile'));
    expect(state.costDeltas[asCardId('missile')]).toEqual([{ amount: -3, until: 'endOfTurn' }]);
    expect(state.prompt?.kind).toBe('main');
    if (state.prompt?.kind !== 'main') throw new Error('expected main');
    const offer = state.prompt.options.find(
      (option) => option.type === 'play' && option.card === asCardId('missile'),
    );
    expect(offer).toMatchObject({ type: 'play', cost: 0, from: 'ex' });
    state = act(state, (promptId) => ({ type: 'play', promptId, card: asCardId('missile') }));
    expect(state.seats[seat].resources.playPoints).toBe(before - 1);
    expect(state.seats[seat].cemetery).toContain(asCardId('missile'));
  });
});
