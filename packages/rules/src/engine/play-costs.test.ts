import { describe, expect, it } from 'vitest';
import { textHash } from '../abilities/generic';
import type { CardScript, Instr } from '../abilities/spec';
import { cardKey, type CardDefinition } from '../model/cards';
import { asCardDefId, asCardId, type CardId, type Seat } from '../model/ids';
import type { MatchState, Prompt } from '../state/state';
import { atFirstMainPhase, must, playUntil, type Run } from '../testing/support';
import { legalMainOptions } from './options';

const promptOf = (state: MatchState): Prompt => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

interface Card {
  readonly id: string;
  readonly def: string;
  readonly patch?: Partial<CardDefinition>;
  readonly script?: CardScript;
}

const scriptFor = (name: string, text: string, abilities: CardScript['abilities']): CardScript => ({
  key: cardKey(name),
  name,
  textHash: textHash(text),
  abilities,
});

/** The active player's hand becomes exactly `cards`, with `playPoints`, and the main prompt is rebuilt. */
function withHand(
  run: Run,
  cards: readonly Card[],
  playPoints: number,
): { run: Run; seat: Seat; ids: readonly CardId[] } {
  const seat = run.state.active!;
  const defs = { ...run.state.defs };
  const scripts = { ...run.state.scripts };
  const instances = { ...run.state.cards };
  for (const card of cards) {
    const defId = asCardDefId(card.def);
    defs[defId] = { ...defs[defId]!, ...card.patch };
    if (card.script) scripts[defId] = card.script;
    instances[asCardId(card.id)] = {
      id: asCardId(card.id),
      def: defId,
      owner: seat,
      token: false,
    };
  }
  const ids = cards.map((card) => asCardId(card.id));
  const mine = {
    ...run.state.seats[seat],
    hand: ids,
    // Play points are clamped to the maximum, so a rich hand needs a rich maximum too.
    resources: { ...run.state.seats[seat].resources, playPoints, maxPlayPoints: playPoints },
  };
  const seats = (
    seat === 0 ? [mine, run.state.seats[1]] : [run.state.seats[0], mine]
  ) as MatchState['seats'];
  const crafted: MatchState = { ...run.state, defs, scripts, cards: instances, seats };
  const prompt: Prompt = {
    ...promptOf(crafted),
    kind: 'main',
    options: legalMainOptions(crafted, seat),
  };
  return { run: { state: { ...crafted, prompt }, events: run.events }, seat, ids };
}

const playable = (state: MatchState, card: string) =>
  (state.prompt?.kind === 'main' ? state.prompt.options : []).find(
    (option) => option.type === 'play' && option.card === asCardId(card),
  );

const play = (run: Run, seat: Seat, card: string): Run =>
  must(run, {
    seat,
    intent: { type: 'play', promptId: promptOf(run.state).id, card: asCardId(card) },
  });

const pick = (run: Run, seat: Seat, cards: readonly string[]): Run =>
  must(run, {
    seat,
    intent: {
      type: 'choose',
      promptId: promptOf(run.state).id,
      choice: { kind: 'selectCards', cards: cards.map(asCardId) },
    },
  });

describe('a reveal cost (CR 10.6.2.2)', () => {
  const text = 'As an additional cost to play this card, reveal 2 Academic cards from your hand.';
  const knowledge = scriptFor('Test Follower 2', text, [
    {
      kind: 'spell',
      key: 'spell',
      additionalCost: { reveal: { n: 2, filter: { trait: 'Academic' } } },
      effect: [{ op: 'draw', n: 1 }],
    },
  ]);
  const spell: Card = {
    id: 'knowledge',
    def: 'test-follower-2',
    patch: { kind: 'spell', attack: null, defense: null, cost: 1, text, traits: ['Academic'] },
    script: knowledge,
  };
  const academic = (id: string, def: string): Card => ({
    id,
    def,
    patch: { traits: ['Academic'] },
  });
  const plain: Card = { id: 'plain', def: 'test-follower-6' };

  it('does not offer the card until two other Academic cards are in hand', () => {
    const run = atFirstMainPhase('reveal-gate');
    const one = withHand(run, [spell, academic('a1', 'test-follower-3'), plain], 5);
    expect(playable(one.run.state, 'knowledge')).toBeUndefined();

    // The card itself is Academic but cannot pay for itself.
    const two = withHand(
      run,
      [spell, academic('a1', 'test-follower-3'), academic('a2', 'test-follower-4')],
      5,
    );
    expect(playable(two.run.state, 'knowledge')).toMatchObject({ type: 'play', cost: 1 });
  });

  it('asks only for qualifying cards, reveals them and leaves them in hand', () => {
    const run = atFirstMainPhase('reveal-pay');
    const prepared = withHand(
      run,
      [
        spell,
        academic('a1', 'test-follower-3'),
        academic('a2', 'test-follower-4'),
        academic('a3', 'test-follower-5'),
        plain,
      ],
      5,
    );
    const { seat } = prepared;
    const asked = play(prepared.run, seat, 'knowledge');
    const prompt = promptOf(asked.state);
    if (prompt.kind !== 'selectCards') throw new Error('expected a card pick');
    // These are the cards the table highlights: Academic cards, never the card being played.
    expect([...prompt.candidates].sort()).toEqual(['a1', 'a2', 'a3']);
    expect([prompt.min, prompt.max]).toEqual([2, 2]);
    expect(prompt.label).toContain('Reveal 2 Academic cards');

    expect(
      reduceRejects(asked, seat, ['a1', 'plain']),
      'a card that does not qualify cannot pay',
    ).toBe(true);
    expect(reduceRejects(asked, seat, ['a1']), 'too few cards cannot pay').toBe(true);

    const paid = pick(asked, seat, ['a1', 'a3']);
    const revealed = paid.events.find((event) => event.type === 'cardsRevealed');
    expect(revealed).toMatchObject({ type: 'cardsRevealed', seat });
    expect(revealed?.type === 'cardsRevealed' ? [...revealed.cards].sort() : []).toEqual([
      'a1',
      'a3',
    ]);

    const settled = playUntil(paid, (state) => state.prompt?.kind === 'main');
    const mine = settled.state.seats[seat];
    expect(mine.hand).toEqual(expect.arrayContaining(['a1', 'a2', 'a3', 'plain']));
    expect(mine.cemetery).toContain('knowledge');
    expect(mine.resources.playPoints).toBe(4);
    expect(settled.events.some((event) => event.type === 'cardsDrawn')).toBe(true);
  });
});

function reduceRejects(run: Run, seat: Seat, cards: readonly string[]): boolean {
  try {
    pick(run, seat, cards);
    return false;
  } catch {
    return true;
  }
}

describe('"the next card you play costs N less"', () => {
  const discountText = 'The next card you play this turn costs 2 less.';
  const discounter = (extra: readonly Instr[] = []): Card => ({
    id: 'boon',
    def: 'test-follower-2',
    patch: { kind: 'spell', attack: null, defense: null, cost: 1, text: discountText },
    script: scriptFor('Test Follower 2', discountText, [
      {
        kind: 'spell',
        key: 'spell',
        effect: [{ op: 'nextPlayCost', amount: -2, thisTurn: true }, ...extra],
      },
    ]),
  });
  const costly = (id: string, def: string, cost: number): Card => ({
    id,
    def,
    patch: { cost },
  });

  it('shows a card as playable the moment the discount makes it affordable, then spends it', () => {
    const run = atFirstMainPhase('next-cost');
    // 4 play points: the 1-cost spell leaves 3, enough for a 5-cost card only after -2.
    const prepared = withHand(
      run,
      [discounter(), costly('big-a', 'test-follower-3', 5), costly('big-b', 'test-follower-4', 5)],
      4,
    );
    const { seat } = prepared;
    expect(
      playable(prepared.run.state, 'big-a'),
      'unaffordable before the discount',
    ).toBeUndefined();

    const afterBoon = playUntil(
      play(prepared.run, seat, 'boon'),
      (state) => state.prompt?.kind === 'main',
    );
    expect(afterBoon.state.playDiscounts).toHaveLength(1);
    // The options the table highlights are rebuilt, so both now show up with the discounted price.
    expect(playable(afterBoon.state, 'big-a')).toMatchObject({ type: 'play', cost: 3 });
    expect(playable(afterBoon.state, 'big-b')).toMatchObject({ type: 'play', cost: 3 });

    const afterPlay = playUntil(
      play(afterBoon, seat, 'big-a'),
      (state) => state.prompt?.kind === 'main',
    );
    expect(afterPlay.state.seats[seat].resources.playPoints).toBe(0);
    expect(afterPlay.state.playDiscounts).toHaveLength(0);
    // "The next" card: the other one is full price again.
    expect(playable(afterPlay.state, 'big-b')).toBeUndefined();
  });

  it('only applies to the cards it names', () => {
    const text = 'The next spell you play costs 2 less.';
    const boon: Card = {
      id: 'boon',
      def: 'test-follower-2',
      patch: { kind: 'spell', attack: null, defense: null, cost: 1, text },
      script: scriptFor('Test Follower 2', text, [
        {
          kind: 'spell',
          key: 'spell',
          effect: [{ op: 'nextPlayCost', amount: -2, filter: { kind: ['spell'] } }],
        },
      ]),
    };
    const run = atFirstMainPhase('next-cost-filter');
    const prepared = withHand(
      run,
      [
        boon,
        costly('follower', 'test-follower-3', 5),
        {
          id: 'spell',
          def: 'test-follower-4',
          patch: { kind: 'spell', attack: null, defense: null, cost: 5 },
        },
      ],
      4,
    );
    const after = playUntil(
      play(prepared.run, prepared.seat, 'boon'),
      (state) => state.prompt?.kind === 'main',
    );
    expect(playable(after.state, 'follower')).toBeUndefined();
    expect(playable(after.state, 'spell')).toMatchObject({ cost: 3 });
  });

  it('lapses at the end of the turn when it is a "this turn" offer', () => {
    const run = atFirstMainPhase('next-cost-lapse');
    const prepared = withHand(run, [discounter()], 4);
    const afterBoon = playUntil(
      play(prepared.run, prepared.seat, 'boon'),
      (state) => state.prompt?.kind === 'main',
    );
    expect(afterBoon.state.playDiscounts).toHaveLength(1);
    const later = playUntil(
      afterBoon,
      (state) => state.turn === 2 && state.prompt?.kind === 'main',
    );
    expect(later.state.playDiscounts).toHaveLength(0);
  });
});

describe('a cemetery-banish extra cost (Dimension Shift)', () => {
  const text =
    'When playing this card, banish 10 spells in your cemetery: This card costs 7 to play.';
  const shift = scriptFor('Test Follower 2', text, [
    {
      kind: 'spell',
      key: 'spell',
      extraCost: {
        label: 'Banish 10 spells from your cemetery: this costs 7?',
        banish: { n: 10, filter: { kind: ['spell'] }, from: { zone: 'cemetery', who: 'you' } },
        reduceBy: 5,
      },
      effect: [{ op: 'extraTurn' }],
    },
  ]);
  const spell: Card = {
    id: 'shift',
    def: 'test-follower-2',
    patch: { kind: 'spell', attack: null, defense: null, cost: 12, text },
    script: shift,
  };

  function withCemetery(run: Run, grave: readonly Card[], playPoints: number) {
    const prepared = withHand(run, [spell], playPoints);
    const seat = prepared.seat;
    const defs = { ...prepared.run.state.defs };
    const instances = { ...prepared.run.state.cards };
    const ids = grave.map((card) => {
      const defId = asCardDefId(card.def);
      defs[defId] = { ...defs[defId]!, ...card.patch };
      const id = asCardId(card.id);
      instances[id] = { id, def: defId, owner: seat, token: false };
      return id;
    });
    const mine = { ...prepared.run.state.seats[seat], cemetery: ids };
    const seats = (
      seat === 0 ? [mine, prepared.run.state.seats[1]] : [prepared.run.state.seats[0], mine]
    ) as MatchState['seats'];
    const crafted: MatchState = { ...prepared.run.state, defs, cards: instances, seats };
    const prompt: Prompt = {
      ...promptOf(crafted),
      kind: 'main',
      options: legalMainOptions(crafted, seat),
    };
    return { run: { state: { ...crafted, prompt }, events: prepared.run.events }, seat, ids };
  }

  const tenSpells = [...Array(10)].map((_, i) => ({
    id: `grave-${i}`,
    def: 'test-follower-3',
    patch: { kind: 'spell' as const, attack: null, defense: null, cost: 1 },
  }));

  it('is not offered at 7 play points until 10 spells are in the cemetery', () => {
    const run = atFirstMainPhase('shift-gate');
    const empty = withCemetery(run, [], 7);
    expect(playable(empty.run.state, 'shift')).toBeUndefined();
    const ready = withCemetery(run, tenSpells, 7);
    expect(playable(ready.run.state, 'shift')).toMatchObject({ type: 'play', cost: 7 });
  });

  it('banishes the chosen spells and queues an extra turn', () => {
    const run = atFirstMainPhase('shift-pay');
    const prepared = withCemetery(run, tenSpells, 7);
    const asked = play(prepared.run, prepared.seat, 'shift');
    expect(promptOf(asked.state).kind).toBe('selectCards');
    const paid = pick(
      asked,
      prepared.seat,
      prepared.ids.map((id) => String(id)),
    );
    const settled = playUntil(paid, (state) => state.prompt?.kind === 'main');
    expect(settled.state.seats[prepared.seat].cemetery).toHaveLength(1);
    expect(settled.state.seats[prepared.seat].banished.map((card) => card.id)).toEqual(
      expect.arrayContaining(prepared.ids),
    );
    expect(settled.state.extraTurns).toBe(1);
    expect(settled.state.seats[prepared.seat].resources.playPoints).toBe(0);
  });
});
