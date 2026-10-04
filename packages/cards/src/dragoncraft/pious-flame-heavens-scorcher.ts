import { scriptOf } from '../define';

export const piousFlameHeavensScorcher = scriptOf('pious-flame-heavens-scorcher', [
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
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'damage', to: 'target', amount: 5 },
      {
        op: 'if',
        cond: { matches: '__extraDiscarded', filter: { costAtLeast: 7 } },
        then: [{ op: 'draw', n: 1 }],
      },
    ],
  },
]);
