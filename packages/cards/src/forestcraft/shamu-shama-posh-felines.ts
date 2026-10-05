import { scriptOf } from '../define';

export const shamuShamaPoshFelines = scriptOf('shamu-shama-posh-felines', [
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
      {
        op: 'if',
        cond: { combo: 5 },
        then: [{ op: 'damage', to: 'foe', amount: 3 }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'strike',
    on: 'strike',
    condition: { combo: 3 },
    effect: [{ op: 'buff', cards: 'self', attack: 1, defense: 1 }],
  },
]);
