import { scriptOf } from '../define';

export const outrunningTheEncroachingHeat = scriptOf('outrunning-the-encroaching-heat', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'grant', cards: 'target', keywords: ['storm'] },
      {
        op: 'if',
        cond: { matches: 'target', filter: { universe: 'Umamusume' } },
        then: [{ op: 'buff', cards: 'target', attack: 1, defense: 1 }],
      },
    ],
  },
]);
