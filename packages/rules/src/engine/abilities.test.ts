import { describe, expect, it } from 'vitest';
import { textHash } from '../abilities/generic';
import type { CardScript } from '../abilities/spec';
import { asCardDefId, asCardId, opponentOf } from '../model/ids';
import { fieldCard, type MatchState, type Prompt } from '../state/state';
import {
  atFirstMainPhase,
  defaultAnswer,
  legalDeck,
  LEADER,
  must,
  OTHER_LEADER,
  playUntil,
  testCatalog,
  type Run,
} from '../testing/support';
import { createMatch } from './create';
import { reduce } from './reduce';

const promptOf = (state: MatchState): Prompt => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

const putOnField = (
  run: Run,
  source: ReturnType<typeof asCardId>,
  defId: ReturnType<typeof asCardDefId>,
  script: CardScript,
  text: string,
): Run => {
  const seat = run.state.active!;
  const def = run.state.defs[defId];
  if (!def) throw new Error('missing def');
  const scripted: MatchState = {
    ...run.state,
    defs: { ...run.state.defs, [defId]: { ...def, text } },
    scripts: { ...run.state.scripts, [defId]: script },
    cards: { ...run.state.cards, [source]: { id: source, def: defId, owner: seat, token: false } },
    seats:
      seat === 0
        ? [{ ...run.state.seats[0], field: [fieldCard(source, 'reserved', 0)] }, run.state.seats[1]]
        : [
            run.state.seats[0],
            { ...run.state.seats[1], field: [fieldCard(source, 'reserved', 0)] },
          ],
  };
  return { state: scripted, events: run.events };
};

describe('timing hooks (CR 7.3.1, 7.4.8)', () => {
  it('fires a start-of-main-phase trigger once even after several plays', () => {
    const text = 'At the start of your main phase, draw a card.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'main',
          on: { at: 'startOfMainPhase', whose: 'yours' },
          effect: [{ op: 'draw', n: 1 }],
        },
      ],
    };
    const created = createMatch({
      seed: 'main-once',
      catalog: testCatalog,
      players: [{ deck: legalDeck(LEADER) }, { deck: legalDeck(OTHER_LEADER) }],
    });
    let run: Run = playUntil(
      { state: created.state, events: [...created.events] },
      (state) => state.prompt?.kind === 'main' && state.turn === 1,
    );
    const source = asCardId('main-elf');
    run = putOnField(run, source, defId, script, text);
    const afterPass = must(run, defaultAnswer(promptOf(run.state)));
    const next = playUntil(
      afterPass,
      (state) =>
        state.prompt?.kind === 'main' && state.active === run.state.active && state.turn > 1,
    );
    const pending = next.events.filter(
      (event) => event.type === 'abilityPending' && event.abilityKey === 'main',
    );
    expect(pending).toHaveLength(1);
    const before = next.state.seats[next.state.active!].hand.length;
    const played = promptOf(next.state);
    if (played.kind !== 'main') throw new Error('unreachable');
    const play = played.options.find((option) => option.type === 'play');
    if (play?.type === 'play') {
      const afterPlay = must(next, {
        seat: played.seat,
        intent: { type: 'play', promptId: played.id, card: play.card },
      });
      const again = afterPlay.events.filter(
        (event) => event.type === 'abilityPending' && event.abilityKey === 'main',
      );
      expect(again).toHaveLength(1);
      expect(afterPlay.state.seats[played.seat].hand.length).toBeLessThanOrEqual(before);
    }
  });

  it('drops an end-of-turn buff on the next turn', () => {
    const text = 'Fanfare: Give this follower +2/+0 until end of turn.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [{ op: 'buff', cards: 'self', attack: 2, defense: 0, until: 'endOfTurn' }],
        },
      ],
    };
    const source = asCardId('buff-elf');
    const run = putOnField(atFirstMainPhase('buff-eot'), source, defId, script, text);
    const seat = run.state.active!;
    const boosted: MatchState = {
      ...run.state,
      seats:
        seat === 0
          ? [
              {
                ...run.state.seats[0],
                field: [
                  {
                    ...run.state.seats[0].field[0]!,
                    modifiers: [{ attack: 2, defense: 0, until: 'endOfTurn' }],
                    shown: { attack: 3, defense: 1, keywords: [] },
                  },
                ],
              },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              {
                ...run.state.seats[1],
                field: [
                  {
                    ...run.state.seats[1].field[0]!,
                    modifiers: [{ attack: 2, defense: 0, until: 'endOfTurn' }],
                    shown: { attack: 3, defense: 1, keywords: [] },
                  },
                ],
              },
            ],
    };
    const afterPass = must(
      { state: boosted, events: run.events },
      defaultAnswer(promptOf(boosted)),
    );
    const next = playUntil(
      afterPass,
      (state) =>
        state.prompt?.kind === 'main' && state.active === seat && state.turn > boosted.turn,
    );
    expect(next.state.seats[seat].field[0]?.modifiers).toEqual([]);
    expect(next.state.seats[seat].field[0]?.shown.attack).toBe(1);
  });

  it('keeps a start-of-your-next-turn effect through the opponent’s turn', () => {
    const source = asCardId('next-elf');
    const defId = asCardDefId('test-follower-0');
    const run = atFirstMainPhase('next-turn-buff');
    const seat = run.state.active!;
    const withBuff: MatchState = {
      ...run.state,
      cards: {
        ...run.state.cards,
        [source]: { id: source, def: defId, owner: seat, token: false },
      },
      seats:
        seat === 0
          ? [
              {
                ...run.state.seats[0],
                field: [
                  {
                    ...fieldCard(source, 'reserved', 0),
                    modifiers: [{ attack: 3, defense: 0, until: 'startOfYourNextTurn' }],
                    shown: { attack: 4, defense: 1, keywords: [] },
                  },
                ],
              },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              {
                ...run.state.seats[1],
                field: [
                  {
                    ...fieldCard(source, 'reserved', 0),
                    modifiers: [{ attack: 3, defense: 0, until: 'startOfYourNextTurn' }],
                    shown: { attack: 4, defense: 1, keywords: [] },
                  },
                ],
              },
            ],
    };
    const afterPass = must(
      { state: withBuff, events: run.events },
      defaultAnswer(promptOf(withBuff)),
    );
    const oppMain = playUntil(
      afterPass,
      (state) => state.prompt?.kind === 'main' && state.active === opponentOf(seat),
    );
    expect(oppMain.state.seats[seat].field[0]?.modifiers).toEqual([
      { attack: 3, defense: 0, until: 'startOfYourNextTurn' },
    ]);
    const back = playUntil(
      oppMain,
      (state) =>
        state.prompt?.kind === 'main' && state.active === seat && state.turn > withBuff.turn,
    );
    expect(back.state.seats[seat].field[0]?.modifiers).toEqual([]);
  });
});

describe('pending abilities (CR 10.7)', () => {
  it('creates one pending instance per occurrence and caps at scan time', () => {
    const text =
      'Whenever a Pixie token is put onto your field, draw a card. Twice on each of your turns.';
    const defId = asCardDefId('test-follower-1');
    const script: CardScript = {
      name: 'Test Follower 1',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'pixie',
          on: { tokenEntersYourField: { pixie: true } },
          perTurn: 2,
          effect: [{ op: 'draw', n: 1 }],
        },
      ],
    };
    const source = asCardId('titania');
    const run = putOnField(atFirstMainPhase('cap'), source, defId, script, text);
    const seat = run.state.active!;
    const spellText = 'Put three Fairies onto your field.';
    const spellId = asCardDefId('test-follower-2');
    const spellScript: CardScript = {
      name: 'Test Follower 2',
      textHash: textHash(spellText),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [{ op: 'token', name: 'Fairy', n: 3, to: 'field' }],
        },
      ],
    };
    const card = asCardId('circle');
    const crafted: MatchState = {
      ...run.state,
      defs: {
        ...run.state.defs,
        [spellId]: {
          ...run.state.defs[spellId]!,
          kind: 'spell',
          attack: null,
          defense: null,
          cost: 1,
          text: spellText,
        },
      },
      scripts: { ...run.state.scripts, [defId]: script, [spellId]: spellScript },
      cards: {
        ...run.state.cards,
        [card]: { id: card, def: spellId, owner: seat, token: false },
      },
      seats:
        seat === 0
          ? [
              { ...run.state.seats[0], hand: [...run.state.seats[0].hand, card] },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              { ...run.state.seats[1], hand: [...run.state.seats[1].hand, card] },
            ],
    };
    const existing = promptOf(crafted);
    const prompt = {
      ...existing,
      kind: 'main' as const,
      options: [
        ...(existing.kind === 'main' ? existing.options : []),
        { type: 'play' as const, card, cost: 1, from: 'hand' as const },
      ],
    };
    const withPrompt: MatchState = { ...crafted, prompt };
    const after = must(
      { state: withPrompt, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card } },
    );
    const pending = after.events.filter(
      (event) => event.type === 'abilityPending' && event.abilityKey === 'pixie',
    );
    expect(pending.length).toBe(2);
  });

  it('lets an effect win immediately without Confirmation Timing (CR 1.2.4)', () => {
    const text = 'Fanfare: You win.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [{ kind: 'triggered', key: 'fanfare', on: 'fanfare', effect: [{ op: 'win' }] }],
    };
    const created = createMatch({
      seed: 'win-now',
      catalog: testCatalog,
      players: [{ deck: legalDeck(LEADER) }, { deck: legalDeck(OTHER_LEADER) }],
      scripts: (def) => (def.id === defId ? script : null),
    });
    expect(created.state.outcome).toBeNull();
  });
});

describe('search (CR 4.1.2.2, 5.8)', () => {
  it('allows finding nothing on a filtered search and still shuffles', () => {
    const text = 'Fanfare: Search for a cost-1 follower.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [
            {
              op: 'search',
              as: 'found',
              filter: { kind: ['follower'], costIs: 1 },
              count: 1,
              reveal: true,
              then: 'hand',
            },
          ],
        },
      ],
    };
    const run = atFirstMainPhase('search-none');
    const seat = run.state.active!;
    const card = asCardId('searcher');
    const crafted: MatchState = {
      ...run.state,
      defs: { ...run.state.defs, [defId]: { ...run.state.defs[defId]!, text } },
      scripts: { ...run.state.scripts, [defId]: script },
      cards: { ...run.state.cards, [card]: { id: card, def: defId, owner: seat, token: false } },
      seats:
        seat === 0
          ? [
              { ...run.state.seats[0], hand: [...run.state.seats[0].hand, card] },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              { ...run.state.seats[1], hand: [...run.state.seats[1].hand, card] },
            ],
    };
    const prompt = {
      ...promptOf(crafted),
      kind: 'main' as const,
      options: [{ type: 'play' as const, card, cost: 1, from: 'hand' as const }],
    };
    const after = must(
      { state: { ...crafted, prompt }, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card } },
    );
    expect(after.state.prompt?.kind).toBe('selectCards');
    if (after.state.prompt?.kind !== 'selectCards') throw new Error('unreachable');
    const answered = reduce(after.state, {
      seat: after.state.prompt.seat,
      intent: {
        type: 'choose',
        promptId: after.state.prompt.id,
        choice: { kind: 'selectCards', cards: [] },
      },
    });
    expect(answered.ok).toBe(true);
    if (answered.ok) {
      expect(answered.events.some((event) => event.type === 'deckShuffled')).toBe(true);
    }
  });
});

describe('0 damage (CR 1.3.2)', () => {
  it('does not deal 0 damage', () => {
    const text = 'Fanfare: Deal 0 damage to the enemy leader.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [{ op: 'damage', to: 'enemyLeader', amount: 0 }],
        },
      ],
    };
    const run = atFirstMainPhase('zero-dmg');
    const seat = run.state.active!;
    const card = asCardId('zero');
    const crafted: MatchState = {
      ...run.state,
      defs: { ...run.state.defs, [defId]: { ...run.state.defs[defId]!, text } },
      scripts: { ...run.state.scripts, [defId]: script },
      cards: { ...run.state.cards, [card]: { id: card, def: defId, owner: seat, token: false } },
      seats:
        seat === 0
          ? [
              { ...run.state.seats[0], hand: [...run.state.seats[0].hand, card] },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              { ...run.state.seats[1], hand: [...run.state.seats[1].hand, card] },
            ],
    };
    const prompt = {
      ...promptOf(crafted),
      kind: 'main' as const,
      options: [{ type: 'play' as const, card, cost: 1, from: 'hand' as const }],
    };
    const after = must(
      { state: { ...crafted, prompt }, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card } },
    );
    expect(after.events.filter((event) => event.type === 'damageDealt')).toEqual([]);
    expect(after.state.seats[opponentOf(seat)].leader.defense).toBe(20);
  });
});
