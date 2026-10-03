import { describe, expect, it } from 'vitest';
import { chatSendSchema, intentSchema, matchJoinOptionsSchema } from './index';

describe('intentSchema', () => {
  it('accepts every intent the engine understands', () => {
    const intents = [
      { type: 'pass', promptId: 4 },
      { type: 'concede' },
      { type: 'engageWards', promptId: 2, cards: ['0:3'] },
      { type: 'engageWards', promptId: 2, cards: [] },
      { type: 'choose', promptId: 1, choice: { kind: 'turnOrder', goFirst: true } },
      { type: 'choose', promptId: 1, choice: { kind: 'mulligan', redraw: false } },
      { type: 'choose', promptId: 9, choice: { kind: 'discard', cards: ['1:12', '1:3'] } },
      { type: 'choose', promptId: 4, choice: { kind: 'selectCards', cards: ['0:1'] } },
      { type: 'choose', promptId: 5, choice: { kind: 'mode', id: '0' } },
      { type: 'choose', promptId: 6, choice: { kind: 'confirm', yes: true } },
      { type: 'choose', promptId: 7, choice: { kind: 'allocate', amounts: [2, 1] } },
      { type: 'choose', promptId: 8, choice: { kind: 'orderPending', id: 1 } },
      { type: 'play', promptId: 10, card: '0:1' },
      { type: 'activate', promptId: 11, card: '0:2', ability: 'serve' },
      { type: 'attack', promptId: 12, attacker: '0:3', target: 'leader' },
      {
        type: 'evolve',
        promptId: 13,
        card: '0:4',
        superEvolve: false,
        useEvolutionPoint: true,
      },
    ];
    for (const intent of intents) {
      expect(intentSchema.safeParse(intent).success, JSON.stringify(intent)).toBe(true);
    }
  });

  it('returns what it parsed, not what it was handed', () => {
    const parsed = intentSchema.parse({ type: 'pass', promptId: 3, smuggled: 'x' });
    expect(parsed).toEqual({ type: 'pass', promptId: 3 });
  });

  it('rejects malformed or hostile payloads', () => {
    const bad: unknown[] = [
      null,
      'pass',
      {},
      { type: 'play', card: '0:1' }, // missing promptId
      { type: 'pass' }, // no prompt quoted
      { type: 'pass', promptId: -1 },
      { type: 'pass', promptId: 1.5 },
      { type: 'pass', promptId: '1' },
      { type: 'choose', promptId: 1, choice: { kind: 'sacrifice' } },
      { type: 'choose', promptId: 1, choice: { kind: 'mulligan' } },
      { type: 'choose', promptId: 1, choice: { kind: 'discard', cards: [3] } },
      { type: 'engageWards', promptId: 1, cards: Array.from({ length: 65 }, (_, i) => `0:${i}`) },
      { type: 'engageWards', promptId: 1, cards: [''] },
      { type: 'engageWards', promptId: 1, cards: ['x'.repeat(33)] },
    ];
    for (const payload of bad) {
      expect(intentSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
  });
});

describe('matchJoinOptionsSchema', () => {
  it('requires a deck to sit and nothing to watch', () => {
    expect(matchJoinOptionsSchema.safeParse({ role: 'player', deckId: 'abc' }).success).toBe(true);
    expect(matchJoinOptionsSchema.safeParse({ role: 'spectator' }).success).toBe(true);
    expect(matchJoinOptionsSchema.safeParse({ role: 'player' }).success).toBe(false);
    expect(matchJoinOptionsSchema.safeParse({ role: 'host' }).success).toBe(false);
    expect(matchJoinOptionsSchema.safeParse({}).success).toBe(false);
  });

  it('does not let a spectator smuggle in a deck or a seat', () => {
    expect(matchJoinOptionsSchema.parse({ role: 'spectator', deckId: 'x', seat: 0 })).toEqual({
      role: 'spectator',
    });
  });
});

describe('chatSendSchema', () => {
  it('trims and bounds messages', () => {
    expect(chatSendSchema.parse({ text: '  gg  ' })).toEqual({ text: 'gg' });
    expect(chatSendSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(chatSendSchema.safeParse({ text: 'x'.repeat(281) }).success).toBe(false);
    expect(chatSendSchema.safeParse({}).success).toBe(false);
  });
});
