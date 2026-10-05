import { scriptOf } from '../define';

export const natureSGuidance = scriptOf('nature-s-guidance', [
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'back',
        from: [{ zone: 'field', who: 'you' }],
        count: 1,
        target: true,
      },
      { op: 'returnToHand', cards: 'back' },
      { op: 'draw', n: 1 },
    ],
  },
]);
