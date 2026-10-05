import { umaGrave } from '../shared';
import { scriptOf } from '../define';

export const duramente = scriptOf('duramente', [
  {
    kind: 'triggered',
    key: 'onRace',
    on: 'onRace',
    effect: [
      { op: 'buff', cards: 'self', attack: 1, defense: 1 },
      { op: 'if', cond: umaGrave(10), then: [{ op: 'recoverPlayPoints', n: 3 }] },
    ],
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'destroy', cards: 'foe' },
      { op: 'damage', to: 'enemyLeader', amount: 2 },
      { op: 'leaderDefense', who: 'you', delta: 2 },
      { op: 'buryTop', n: 2 },
    ],
  },
]);
