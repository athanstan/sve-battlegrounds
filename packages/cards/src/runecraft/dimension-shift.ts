import { scriptOf } from '../define';

export const dimensionShift = scriptOf(
  'dimension-shift',
  [
    {
      kind: 'spell',
      key: 'spell',
      extraCost: {
        label: 'Banish 10 spells from your cemetery: this costs 7?',
        banish: {
          n: 10,
          filter: { kind: ['spell'] },
          from: { zone: 'cemetery', who: 'you' },
        },
        reduceBy: 5,
      },
      effect: [{ op: 'extraTurn' }],
    },
  ],
  { allPrintings: true },
);
