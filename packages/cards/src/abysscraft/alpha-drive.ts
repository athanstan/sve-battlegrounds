import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };

export const alphaDrive = scriptOf('alpha-drive', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Return a Machina follower from your cemetery',
            effect: [
              {
                op: 'select',
                as: 'back',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: machinaFollower,
                count: 1,
              },
              { op: 'move', cards: 'back', to: 'hand' },
            ],
          },
          {
            label: 'Summon a Mono, Garnet Rebel from your cemetery',
            effect: [
              {
                op: 'select',
                as: 'mono',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: { name: 'Mono, Garnet Rebel' },
                count: 1,
              },
              { op: 'move', cards: 'mono', to: 'field' },
            ],
          },
        ],
      },
    ],
  },
]);
