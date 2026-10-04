import { scriptOf } from '../define';

export const hishiMiracle = scriptOf('hishi-miracle', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      { op: 'buryTop', n: 2, as: 'buried' },
      {
        op: 'if',
        cond: { sameCost: 'buried' },
        then: [{ op: 'draw', n: 1 }],
      },
    ],
  },
]);

export const hishiMiracleEvolved = scriptOf('hishi-miracle@evolved', [
  {
    kind: 'triggered',
    key: 'end',
    on: { at: 'startOfEndPhase', whose: 'yours' },
    effect: [
      {
        op: 'if',
        cond: {
          atLeast: 9,
          value: {
            count: { zone: 'evolveDeckRevealed', who: 'you' },
            filter: { name: 'Carrot' },
          },
        },
        then: [{ op: 'buryTop', n: 20, who: 'opponent' }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'optional',
        label: 'Discard 2 Umamusume cards: Draw 2 cards?',
        cost: [{ op: 'discard', who: 'you', n: 2, filter: { universe: 'Umamusume' }, as: 'paid' }],
        then: [{ op: 'draw', n: 2 }],
      },
    ],
  },
]);
