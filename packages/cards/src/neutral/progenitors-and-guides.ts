import { scriptOf } from '../define';

export const progenitorsAndGuides = scriptOf('progenitors-and-guides', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'optional',
        label: 'Discard an Umamusume card: Recover 4 play points?',
        cost: [{ op: 'discard', who: 'you', n: 1, filter: { universe: 'Umamusume' } }],
        then: [{ op: 'recoverPlayPoints', n: 4 }],
      },
    ],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { engage: true },
    label: 'Choose one',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Return a 5-cost or less Umamusume follower',
            effect: [
              {
                op: 'select',
                as: 'picked',
                from: [{ zone: 'cemetery', who: 'you' }],
                filter: { kind: ['follower'], universe: 'Umamusume', costAtMost: 5 },
                count: { upTo: 1 },
              },
              { op: 'move', cards: 'picked', to: 'hand' },
            ],
          },
          {
            label: 'Turn Carrots face down and gain an Evolution Point',
            effect: [
              { op: 'turnCarrots', faceUp: false, upTo: 2 },
              { op: 'gainEvolutionPoints', n: 1 },
            ],
          },
          {
            label: 'Give other Umamusume followers +1/+1',
            effect: [
              {
                op: 'buff',
                cards: {
                  each: { zone: 'field', who: 'you' },
                  filter: { kind: ['follower'], universe: 'Umamusume', other: true },
                },
                attack: 1,
                defense: 1,
              },
            ],
          },
        ],
      },
    ],
  },
]);
