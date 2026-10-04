import { scriptOf } from '../define';

export const mrBertrandMagicMentor = scriptOf('mr-bertrand-magic-mentor', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Put a Mysterian Missile token into EX',
            effect: [{ op: 'token', name: 'Mysterian Missile', n: 1, to: 'ex' }],
          },
          {
            label: 'Select an Academic spell from cemetery',
            effect: [
              {
                op: 'select',
                as: 'spell',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: { kind: ['spell'], trait: 'Academic' },
                count: 1,
              },
              {
                op: 'if',
                cond: {
                  atLeast: 5,
                  value: {
                    count: { zone: 'cemetery', who: 'you' },
                    filter: { trait: 'Academic' },
                  },
                },
                then: [{ op: 'move', cards: 'spell', to: 'hand' }],
              },
            ],
          },
        ],
      },
    ],
  },
]);
