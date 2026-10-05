import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };

export const aeneaAmethystRebel = scriptOf('aenea-amethyst-rebel', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { ...machinaFollower, costAtMost: 3 },
        count: 1,
        reveal: false,
        then: 'field',
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'lastWords',
    on: 'lastWords',
    effect: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
  },
]);
