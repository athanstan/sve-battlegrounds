import { scriptOf } from '../define';

export const vagabondLizard = scriptOf('vagabond-lizard', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'optional',
        label: 'Put a Bullet Bike token onto your field or into your EX area?',
        cost: [],
        then: [
          {
            op: 'chooseOne',
            options: [
              {
                label: 'Summon Bullet Bike',
                effect: [{ op: 'token', name: 'Bullet Bike', n: 1, to: 'field' }],
              },
              {
                label: 'Put Bullet Bike into EX',
                effect: [{ op: 'token', name: 'Bullet Bike', n: 1, to: 'ex' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'lastWords',
    on: 'lastWords',
    effect: [{ op: 'token', name: 'Dutiful Steed', n: 1, to: 'ex' }],
  },
]);
