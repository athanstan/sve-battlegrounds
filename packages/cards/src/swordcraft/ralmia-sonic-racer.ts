import { scriptOf } from '../define';

export const ralmiaSonicRacer = scriptOf('ralmia-sonic-racer', [
  {
    kind: 'static',
    key: 'evolveDiscount',
    validIn: ['field'],
    evolveCostDelta: {
      count: { zone: 'field', who: 'you' },
      filter: { kind: ['follower'], other: true },
      times: -1,
    },
  },
]);

export const ralmiaSonicRacerEvolved = scriptOf('ralmia-sonic-racer@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'optional',
        label: 'Pay 3 play points: +1/+1 for each other follower?',
        cost: [{ op: 'payPlayPoints', n: 3 }],
        then: [
          {
            op: 'buff',
            cards: 'self',
            attack: {
              count: { zone: 'field', who: 'you' },
              filter: { kind: ['follower'], other: true },
            },
            defense: {
              count: { zone: 'field', who: 'you' },
              filter: { kind: ['follower'], other: true },
            },
          },
        ],
      },
    ],
  },
]);
