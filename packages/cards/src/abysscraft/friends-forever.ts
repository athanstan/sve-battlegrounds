import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };

export const friendsForever = scriptOf('friends-forever', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'summoned',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: machinaFollower,
        count: { upTo: 2 },
        costAtMostTotal: 5,
      },
      { op: 'move', cards: 'summoned', to: 'field' },
    ],
  },
]);
