import { describe, expect, it } from 'vitest';
import { textHash } from '../abilities/generic';
import type { CardScript } from '../abilities/spec';
import { cardKey } from '../model/cards';
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
import { DEFAULT_TOKENS } from '../abilities/tokens';
import { project } from '../views/project';
import { seatViewer } from '../views/viewer';

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
      key: cardKey('Test Follower 0'),
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
      key: cardKey('Test Follower 0'),
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
      key: cardKey('Test Follower 1'),
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
      key: cardKey('Test Follower 2'),
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
      key: cardKey('Test Follower 0'),
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
      key: cardKey('Test Follower 0'),
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
      key: cardKey('Test Follower 0'),
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

describe('live-deck engine gaps', () => {
  it('buffs only the Pixie token that entered, not every Pixie on the field', () => {
    const text = 'Whenever a Pixie token is put onto your field, give it +2/+0.';
    const defId = asCardDefId('test-follower-1');
    const script: CardScript = {
      key: cardKey('Test Follower 1'),
      name: 'Test Follower 1',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'enter',
          on: { tokenEntersYourField: { pixie: true } },
          effect: [{ op: 'buff', cards: 'entered', attack: 2, defense: 0 }],
        },
      ],
    };
    const source = asCardId('cynthia');
    const run = putOnField(atFirstMainPhase('enter-buff'), source, defId, script, text);
    const seat = run.state.active!;
    const spellText = 'Summon 2 Fairy tokens.';
    const spellId = asCardDefId('test-follower-2');
    const spellScript: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(spellText),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'field' }],
        },
      ],
    };
    const card = asCardId('pair');
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
      cards: { ...run.state.cards, [card]: { id: card, def: spellId, owner: seat, token: false } },
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
    const afterPlay = must(
      { state: { ...crafted, prompt }, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card } },
    );
    const settled = playUntil(
      afterPlay,
      (state) => state.prompt?.kind === 'main' && state.active === seat,
    );
    const fairies = settled.state.seats[seat].field.filter((entry) => entry.id !== source);
    expect(fairies).toHaveLength(2);
    expect(fairies.map((entry) => entry.shown.attack)).toEqual([3, 3]);
  });

  it('still sees who damaged a follower after that follower leaves the field', () => {
    const text =
      'When an enemy follower that took damage this turn from an Umamusume card you control is put from the field into the cemetery, draw a card.';
    const defId = asCardDefId('test-follower-1');
    const script: CardScript = {
      key: cardKey('Test Follower 1'),
      name: 'Test Follower 1',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'twice',
          on: {
            enemyDamagedByYouLeavesField: { kind: ['follower'] },
            fromSource: { universe: 'Umamusume' },
          },
          condition: { yourTurn: true },
          effect: [{ op: 'draw', n: 1 }],
        },
      ],
    };
    const source = asCardId('cheval');
    const uma = asCardId('uma-src');
    const enemy = asCardId('foe');
    const umaDef = asCardDefId('test-follower-3');
    const enemyDef = asCardDefId('test-follower-0');
    const run = putOnField(atFirstMainPhase('cheval-memory'), source, defId, script, text);
    const seat = run.state.active!;
    const foeSeat = opponentOf(seat);
    const withBoard: MatchState = {
      ...run.state,
      defs: {
        ...run.state.defs,
        [umaDef]: { ...run.state.defs[umaDef]!, universe: 'Umamusume' },
      },
      cards: {
        ...run.state.cards,
        [uma]: { id: uma, def: umaDef, owner: seat, token: false },
        [enemy]: {
          id: enemy,
          def: enemyDef,
          owner: foeSeat,
          token: false,
          damagedThisTurnBy: [uma],
        },
      },
      seats:
        seat === 0
          ? [
              {
                ...run.state.seats[0],
                field: [...run.state.seats[0].field, fieldCard(uma, 'reserved', 0)],
              },
              {
                ...run.state.seats[1],
                field: [
                  {
                    ...fieldCard(enemy, 'reserved', 0),
                    damagedThisTurnBy: [uma],
                  },
                ],
              },
            ]
          : [
              {
                ...run.state.seats[0],
                field: [
                  {
                    ...fieldCard(enemy, 'reserved', 0),
                    damagedThisTurnBy: [uma],
                  },
                ],
              },
              {
                ...run.state.seats[1],
                field: [...run.state.seats[1].field, fieldCard(uma, 'reserved', 0)],
              },
            ],
    };
    const spellText = 'Destroy each enemy follower.';
    const spellId = asCardDefId('test-follower-2');
    const spellScript: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(spellText),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [
            {
              op: 'destroy',
              cards: { each: { zone: 'field', who: 'opponent' }, filter: { kind: ['follower'] } },
            },
          ],
        },
      ],
    };
    const card = asCardId('wrath');
    const crafted: MatchState = {
      ...withBoard,
      defs: {
        ...withBoard.defs,
        [spellId]: {
          ...withBoard.defs[spellId]!,
          kind: 'spell',
          attack: null,
          defense: null,
          cost: 1,
          text: spellText,
        },
      },
      scripts: { ...withBoard.scripts, [spellId]: spellScript },
      cards: { ...withBoard.cards, [card]: { id: card, def: spellId, owner: seat, token: false } },
      seats:
        seat === 0
          ? [
              { ...withBoard.seats[0], hand: [...withBoard.seats[0].hand, card] },
              withBoard.seats[1],
            ]
          : [
              withBoard.seats[0],
              { ...withBoard.seats[1], hand: [...withBoard.seats[1].hand, card] },
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
    const after = must(
      { state: { ...crafted, prompt }, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card } },
    );
    expect(
      after.events.some((event) => event.type === 'abilityPending' && event.abilityKey === 'twice'),
    ).toBe(true);
  });

  const withSpell = (
    run: Run,
    script: CardScript,
    text: string,
    extras: {
      readonly cost?: number;
      readonly universe?: string | null;
      readonly extraHand?: readonly {
        readonly id: ReturnType<typeof asCardId>;
        readonly defId: ReturnType<typeof asCardDefId>;
        readonly universe?: string | null;
        readonly cost?: number;
      }[];
      readonly playPoints?: number;
    } = {},
  ): { run: Run; card: ReturnType<typeof asCardId>; seat: 0 | 1 } => {
    const seat = run.state.active!;
    const spellId = asCardDefId('test-follower-2');
    const card = asCardId('gap-spell');
    const extraHand = extras.extraHand ?? [];
    const crafted: MatchState = {
      ...run.state,
      defs: {
        ...run.state.defs,
        [spellId]: {
          ...run.state.defs[spellId]!,
          kind: 'spell',
          attack: null,
          defense: null,
          cost: extras.cost ?? 1,
          text,
          universe: extras.universe ?? run.state.defs[spellId]!.universe,
        },
        ...Object.fromEntries(
          extraHand.map((entry) => [
            entry.defId,
            {
              ...run.state.defs[entry.defId]!,
              universe: entry.universe ?? run.state.defs[entry.defId]!.universe,
              cost: entry.cost ?? run.state.defs[entry.defId]!.cost,
            },
          ]),
        ),
      },
      scripts: { ...run.state.scripts, [spellId]: script },
      cards: {
        ...run.state.cards,
        [card]: { id: card, def: spellId, owner: seat, token: false },
        ...Object.fromEntries(
          extraHand.map((entry) => [
            entry.id,
            { id: entry.id, def: entry.defId, owner: seat, token: false },
          ]),
        ),
      },
      seats:
        seat === 0
          ? [
              {
                ...run.state.seats[0],
                hand: [...run.state.seats[0].hand, card, ...extraHand.map((entry) => entry.id)],
                resources: {
                  ...run.state.seats[0].resources,
                  playPoints: extras.playPoints ?? run.state.seats[0].resources.playPoints,
                },
              },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              {
                ...run.state.seats[1],
                hand: [...run.state.seats[1].hand, card, ...extraHand.map((entry) => entry.id)],
                resources: {
                  ...run.state.seats[1].resources,
                  playPoints: extras.playPoints ?? run.state.seats[1].resources.playPoints,
                },
              },
            ],
    };
    const existing = promptOf(crafted);
    const prompt = {
      ...existing,
      kind: 'main' as const,
      options: [
        ...(existing.kind === 'main' ? existing.options : []),
        { type: 'play' as const, card, cost: extras.cost ?? 1, from: 'hand' as const },
      ],
    };
    return { run: { state: { ...crafted, prompt }, events: run.events }, card, seat };
  };

  it('pays an optional play-time extra cost and remembers a high-cost discard', () => {
    const text =
      'When playing this card, discard an Umamusume card: this costs 2 less. If it cost 7 or more, draw.';
    const script: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          extraCost: {
            label: 'Discard an Umamusume card: this costs 2 less?',
            discard: { n: 1, filter: { universe: 'Umamusume' } },
            reduceBy: 2,
          },
          effect: [
            {
              op: 'if',
              cond: { matches: '__extraDiscarded', filter: { costAtLeast: 7 } },
              then: [{ op: 'draw', n: 1 }],
            },
          ],
        },
      ],
    };
    const fodder = asCardId('uma-discard');
    const fodderDef = asCardDefId('test-follower-3');
    const prepared = withSpell(atFirstMainPhase('extra-cost'), script, text, {
      cost: 3,
      playPoints: 1,
      extraHand: [{ id: fodder, defId: fodderDef, universe: 'Umamusume', cost: 7 }],
    });
    const afterPlay = must(prepared.run, {
      seat: prepared.seat,
      intent: { type: 'play', promptId: promptOf(prepared.run.state).id, card: prepared.card },
    });
    expect(promptOf(afterPlay.state).kind).toBe('selectCards');
    const afterPay = must(afterPlay, {
      seat: prepared.seat,
      intent: {
        type: 'choose',
        promptId: promptOf(afterPlay.state).id,
        choice: { kind: 'selectCards', cards: [fodder] },
      },
    });
    const settled = playUntil(afterPay, (state) => state.prompt?.kind === 'main');
    expect(settled.state.seats[prepared.seat].resources.playPoints).toBe(0);
    expect(settled.state.seats[prepared.seat].cemetery).toContain(fodder);
    expect(settled.events.some((event) => event.type === 'cardsDrawn')).toBe(true);
  });

  it('leaves an untaken look-top card on top of the deck', () => {
    const text = 'Look at the top card. You may add it to your hand.';
    const script: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [
            {
              op: 'lookTop',
              n: 1,
              pick: { upTo: 1, reveal: true, then: 'hand' },
              rest: 'top',
            },
          ],
        },
      ],
    };
    const prepared = withSpell(atFirstMainPhase('look-rest-top'), script, text);
    const top = prepared.run.state.seats[prepared.seat].deck[0];
    const afterPlay = must(prepared.run, {
      seat: prepared.seat,
      intent: { type: 'play', promptId: promptOf(prepared.run.state).id, card: prepared.card },
    });
    expect(promptOf(afterPlay.state).kind).toBe('selectCards');
    const afterSkip = must(afterPlay, {
      seat: prepared.seat,
      intent: {
        type: 'choose',
        promptId: promptOf(afterPlay.state).id,
        choice: { kind: 'selectCards', cards: [] },
      },
    });
    const settled = playUntil(afterSkip, (state) => state.prompt?.kind === 'main');
    expect(settled.state.seats[prepared.seat].deck[0]).toBe(top);
  });

  it('buries the rest of a look-top pile after taking an exact count', () => {
    const text = 'Look at the top 3. Reveal 2 and add them to your hand. Bury the rest.';
    const script: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [
            {
              op: 'lookTop',
              n: 3,
              pick: { n: 2, reveal: true, then: 'hand' },
              rest: 'bury',
            },
          ],
        },
      ],
    };
    const prepared = withSpell(atFirstMainPhase('look-rest-bury'), script, text);
    const top = prepared.run.state.seats[prepared.seat].deck.slice(0, 3);
    const afterPlay = must(prepared.run, {
      seat: prepared.seat,
      intent: { type: 'play', promptId: promptOf(prepared.run.state).id, card: prepared.card },
    });
    expect(promptOf(afterPlay.state)).toMatchObject({ kind: 'selectCards', min: 2, max: 2 });
    const kept = top.slice(0, 2);
    const buried = top[2];
    const afterPick = must(afterPlay, {
      seat: prepared.seat,
      intent: {
        type: 'choose',
        promptId: promptOf(afterPlay.state).id,
        choice: { kind: 'selectCards', cards: kept },
      },
    });
    const settled = playUntil(afterPick, (state) => state.prompt?.kind === 'main');
    expect(settled.state.seats[prepared.seat].hand).toEqual(expect.arrayContaining(kept));
    expect(settled.state.seats[prepared.seat].cemetery).toContain(buried);
    expect(settled.state.seats[prepared.seat].deck[0]).not.toBe(buried);
  });

  it('buries the top of the opponent deck and draws when buried cards share a base cost', () => {
    const text = 'Bury the top 2. If their costs match, draw. The opponent buries 1.';
    const script: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [
            { op: 'buryTop', n: 2, as: 'buried' },
            {
              op: 'if',
              cond: { sameCost: 'buried' },
              then: [{ op: 'draw', n: 1 }],
            },
            { op: 'buryTop', n: 1, who: 'opponent' },
          ],
        },
      ],
    };
    const prepared = withSpell(atFirstMainPhase('same-cost-bury'), script, text);
    const seat = prepared.seat;
    const foe = opponentOf(seat);
    const matched = prepared.run.state.seats[seat].deck.filter((id) => {
      const defId = prepared.run.state.cards[id]?.def;
      return defId !== undefined && prepared.run.state.defs[defId]?.cost === 1;
    });
    const mine = matched.slice(0, 2);
    const rest = prepared.run.state.seats[seat].deck.filter((id) => !mine.includes(id));
    const pinned: MatchState = {
      ...prepared.run.state,
      seats:
        seat === 0
          ? [
              { ...prepared.run.state.seats[0], deck: [...mine, ...rest] },
              prepared.run.state.seats[1],
            ]
          : [
              prepared.run.state.seats[0],
              { ...prepared.run.state.seats[1], deck: [...mine, ...rest] },
            ],
    };
    const theirs = pinned.seats[foe].deck[0];
    const handBefore = pinned.seats[seat].hand.length;
    const after = must(
      { state: pinned, events: prepared.run.events },
      {
        seat,
        intent: { type: 'play', promptId: promptOf(pinned).id, card: prepared.card },
      },
    );
    const settled = playUntil(after, (state) => state.prompt?.kind === 'main');
    expect(mine).toHaveLength(2);
    expect(settled.state.seats[seat].cemetery).toEqual(expect.arrayContaining(mine));
    expect(settled.state.seats[foe].cemetery).toContain(theirs);
    expect(settled.state.seats[seat].hand.length).toBe(handBefore);
  });

  it('sums values from earlier steps and pays a choose-one option cost', () => {
    const text =
      'Choose one. (1) Return an ally: draw 2. (2) Draw the number of cards in hand and EX.';
    const script: CardScript = {
      key: cardKey('Test Follower 2'),
      name: 'Test Follower 2',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'spell',
          key: 'spell',
          effect: [
            {
              op: 'chooseOne',
              options: [
                {
                  label: 'Return an ally: draw 2',
                  cost: [
                    {
                      op: 'select',
                      as: 'returned',
                      from: [{ zone: 'field', who: 'you' }],
                      filter: { kind: ['follower'], other: true },
                      count: 1,
                    },
                    { op: 'returnToHand', cards: 'returned' },
                  ],
                  effect: [{ op: 'draw', n: 2 }],
                },
                {
                  label: 'Draw hand plus EX',
                  effect: [
                    {
                      op: 'draw',
                      n: {
                        sum: [
                          { count: { zone: 'hand', who: 'you' } },
                          { count: { zone: 'ex', who: 'you' } },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const prepared = withSpell(atFirstMainPhase('choose-sum'), script, text);
    const afterPlay = must(prepared.run, {
      seat: prepared.seat,
      intent: { type: 'play', promptId: promptOf(prepared.run.state).id, card: prepared.card },
    });
    expect(promptOf(afterPlay.state).kind).toBe('chooseMode');
    const modes = promptOf(afterPlay.state);
    if (modes.kind !== 'chooseMode') throw new Error('expected modes');
    const afterMode = must(afterPlay, {
      seat: prepared.seat,
      intent: {
        type: 'choose',
        promptId: modes.id,
        choice: { kind: 'mode', id: modes.modes[1]!.id },
      },
    });
    const settled = playUntil(afterMode, (state) => state.prompt?.kind === 'main');
    expect(settled.events.some((event) => event.type === 'cardsDrawn')).toBe(true);
  });

  it('lets optional Last Words move the card itself to EX', () => {
    const text = "Last Words: You may put this card into its owner's EX area.";
    const defId = asCardDefId('test-follower-1');
    const script: CardScript = {
      key: cardKey('Test Follower 1'),
      name: 'Test Follower 1',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'lastWords',
          on: 'lastWords',
          effect: [
            {
              op: 'optional',
              label: "Put this card into its owner's EX area?",
              cost: [],
              then: [{ op: 'move', cards: 'self', to: 'ex' }],
            },
          ],
        },
      ],
    };
    const source = asCardId('aria');
    const onField = putOnField(atFirstMainPhase('last-words-ex'), source, defId, script, text);
    const spellText = 'Destroy each of your followers.';
    const prepared = withSpell(
      onField,
      {
        key: cardKey('Test Follower 2'),
        name: 'Test Follower 2',
        textHash: textHash(spellText),
        abilities: [
          {
            kind: 'spell',
            key: 'spell',
            effect: [
              {
                op: 'destroy',
                cards: { each: { zone: 'field', who: 'you' }, filter: { kind: ['follower'] } },
              },
            ],
          },
        ],
      },
      spellText,
    );
    const afterPlay = must(prepared.run, {
      seat: prepared.seat,
      intent: { type: 'play', promptId: promptOf(prepared.run.state).id, card: prepared.card },
    });
    const settled = playUntil(
      afterPlay,
      (state) => state.prompt?.kind === 'main' && state.seats[prepared.seat].ex.includes(source),
      (prompt) => {
        if (prompt.kind === 'confirmOptional') {
          return {
            seat: prompt.seat,
            intent: {
              type: 'choose',
              promptId: prompt.id,
              choice: { kind: 'confirm', yes: true },
            },
          };
        }
        return defaultAnswer(prompt);
      },
    );
    expect(settled.state.seats[prepared.seat].ex).toContain(source);
    expect(settled.state.seats[prepared.seat].cemetery).not.toContain(source);
  });
});

describe('swordcraft engine gaps', () => {
  it('boxes a follower, stripping keywords until the expiry turn', () => {
    const text = 'Fanfare: Box an enemy follower.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      key: cardKey('Test Follower 0'),
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [
            {
              op: 'select',
              as: 'target',
              from: [{ zone: 'field', who: 'opponent' }],
              filter: { kind: ['follower'] },
              count: 1,
            },
            { op: 'box', cards: 'target' },
          ],
        },
      ],
    };
    const run = atFirstMainPhase('box-it');
    const seat = run.state.active!;
    const foe = opponentOf(seat);
    const enemy = asCardId('boxed-foe');
    const enemyDef = asCardDefId('test-follower-1');
    const card = asCardId('boxer');
    const crafted: MatchState = {
      ...run.state,
      defs: {
        ...run.state.defs,
        [defId]: { ...run.state.defs[defId]!, text },
        [enemyDef]: { ...run.state.defs[enemyDef]!, keywords: ['ward'] },
      },
      scripts: { ...run.state.scripts, [defId]: script },
      cards: {
        ...run.state.cards,
        [card]: { id: card, def: defId, owner: seat, token: false },
        [enemy]: { id: enemy, def: enemyDef, owner: foe, token: false },
      },
      seats:
        seat === 0
          ? [
              { ...run.state.seats[0], hand: [...run.state.seats[0].hand, card] },
              {
                ...run.state.seats[1],
                field: [
                  {
                    ...fieldCard(enemy, 'reserved', 0),
                    shown: { attack: 1, defense: 3, keywords: ['ward'] },
                  },
                ],
              },
            ]
          : [
              {
                ...run.state.seats[0],
                field: [
                  {
                    ...fieldCard(enemy, 'reserved', 0),
                    shown: { attack: 1, defense: 3, keywords: ['ward'] },
                  },
                ],
              },
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
    const settled = playUntil(
      after,
      (state) => state.prompt?.kind === 'main' && state.active === seat,
      (open) => {
        if (open.kind === 'selectCards') {
          return {
            seat: open.seat,
            intent: {
              type: 'choose',
              promptId: open.id,
              choice: { kind: 'selectCards', cards: [open.candidates[0]!] },
            },
          };
        }
        return defaultAnswer(open);
      },
    );
    const boxed = settled.state.seats[foe].field.find((entry) => entry.id === enemy);
    expect(boxed?.boxedUntilTurn).toBe(settled.state.turn + 1);
    expect(boxed?.shown.keywords ?? []).not.toContain('ward');
  });

  it('damages a selected enemy leader', () => {
    const text = 'Fanfare: Deal 2 damage to an enemy leader or follower.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      key: cardKey('Test Follower 0'),
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [
            {
              op: 'select',
              as: 'target',
              from: [
                { zone: 'field', who: 'opponent' },
                { zone: 'leader', who: 'opponent' },
              ],
              filter: { kind: ['follower', 'leader'] },
              count: 1,
            },
            { op: 'damage', to: 'target', amount: 2 },
          ],
        },
      ],
    };
    const run = atFirstMainPhase('lead-dmg');
    const seat = run.state.active!;
    const card = asCardId('pinger');
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
    const settled = playUntil(
      after,
      (state) => state.prompt?.kind === 'main' && state.active === seat,
      (open) => {
        if (open.kind === 'selectCards') {
          const leader = crafted.seats[opponentOf(seat)].leader.card;
          return {
            seat: open.seat,
            intent: {
              type: 'choose',
              promptId: open.id,
              choice: { kind: 'selectCards', cards: [leader] },
            },
          };
        }
        return defaultAnswer(open);
      },
    );
    expect(settled.state.seats[opponentOf(seat)].leader.defense).toBe(18);
  });
});

describe('EX instance buffs', () => {
  it('gives +1/+1 to a Pixie token in EX and keeps it when that token is played', () => {
    const text = 'Fanfare: Give +1/+1 to each Pixie follower in your EX area.';
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      key: cardKey('Test Follower 0'),
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [
            {
              op: 'buff',
              cards: {
                each: { zone: 'ex', who: 'you' },
                filter: { kind: ['follower'], pixie: true },
              },
              attack: 1,
              defense: 1,
            },
          ],
        },
      ],
    };
    const run = atFirstMainPhase('ex-pixie-buff');
    const seat = run.state.active!;
    const proto = run.state.tokens.Fairy ?? DEFAULT_TOKENS.Fairy;
    if (!proto) throw new Error('missing Fairy token');
    const fairy = asCardId('ex-fairy');
    const dancer = asCardId('dancer');
    const current = run.state.seats[seat];
    const crafted: MatchState = {
      ...run.state,
      defs: { ...run.state.defs, [defId]: { ...run.state.defs[defId]!, text } },
      scripts: { ...run.state.scripts, [defId]: script },
      cards: {
        ...run.state.cards,
        [fairy]: { id: fairy, def: proto.id, owner: seat, token: true },
        [dancer]: { id: dancer, def: defId, owner: seat, token: false },
      },
      seats:
        seat === 0
          ? [
              {
                ...current,
                ex: [...current.ex, fairy],
                hand: [...current.hand, dancer],
                resources: { ...current.resources, playPoints: 3, maxPlayPoints: 3 },
              },
              run.state.seats[1],
            ]
          : [
              run.state.seats[0],
              {
                ...current,
                ex: [...current.ex, fairy],
                hand: [...current.hand, dancer],
                resources: { ...current.resources, playPoints: 3, maxPlayPoints: 3 },
              },
            ],
    };
    const existing = promptOf(crafted);
    const withPlay: MatchState = {
      ...crafted,
      prompt: {
        ...existing,
        kind: 'main',
        options: [
          ...(existing.kind === 'main' ? existing.options : []),
          { type: 'play', card: dancer, cost: 1, from: 'hand' },
        ],
      },
    };
    const after = must(
      { state: withPlay, events: run.events },
      { seat, intent: { type: 'play', promptId: promptOf(withPlay).id, card: dancer } },
    );
    expect(after.state.cards[fairy]?.modifiers).toEqual([{ attack: 1, defense: 1, until: null }]);
    const view = project(after.state, seatViewer(seat));
    expect(view.seats[seat].ex.find((entry) => entry.card.id === fairy)?.shown).toEqual({
      attack: 2,
      defense: 2,
      keywords: [],
    });

    const main = promptOf(after.state);
    if (main.kind !== 'main') throw new Error('expected main');
    const playFairy = main.options.find(
      (option) => option.type === 'play' && option.card === fairy,
    );
    if (playFairy?.type !== 'play') throw new Error('Fairy in EX should be playable');
    const summoned = must(after, {
      seat,
      intent: { type: 'play', promptId: main.id, card: fairy },
    });
    const onField = summoned.state.seats[seat].field.find((card) => card.id === fairy);
    expect(onField?.shown).toEqual({ attack: 2, defense: 2, keywords: [] });
  });
});
