import { scriptOf } from '../define';

export const amatazReverseBlader = scriptOf('amataz-reverse-blader', []);

export const amatazReverseBladerEvolved = scriptOf('amataz-reverse-blader@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: { upTo: 1 },
        target: true,
      },
      {
        op: 'if',
        cond: { atLeast: 3, value: { count: { zone: 'ex', who: 'you' } } },
        then: [{ op: 'destroy', cards: 'target' }],
      },
      {
        op: 'if',
        cond: {
          atLeast: 3,
          value: { count: { zone: 'ex', who: 'you' }, filter: { pixie: true } },
        },
        then: [{ op: 'damage', to: 'enemyLeader', amount: 2 }],
      },
    ],
  },
]);
