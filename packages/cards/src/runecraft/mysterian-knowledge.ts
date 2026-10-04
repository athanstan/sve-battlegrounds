import { scriptOf } from '../define';

export const mysterianKnowledge = scriptOf('mysterian-knowledge', [
  {
    kind: 'spell',
    key: 'spell',
    // "As an additional cost to play this card, reveal 2 Academic cards from your hand."
    // The card is not offered without two other Academic cards in hand; they are picked while
    // playing it and stay in hand.
    additionalCost: { reveal: { n: 2, filter: { trait: 'Academic' } } },
    effect: [
      { op: 'draw', n: 1 },
      { op: 'token', name: 'Mysterian Missile', n: 1, to: 'ex' },
    ],
  },
]);
