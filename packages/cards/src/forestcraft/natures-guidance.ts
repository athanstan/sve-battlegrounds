import { defineCard, printed } from '../define';

export const naturesGuidanceText = printed(
  'Select a follower on your field and return it to your hand. Draw a card.',
);

export const naturesGuidance = defineCard({
  name: "Nature's Guidance",
  text: naturesGuidanceText,
  abilities: [
    {
      kind: 'spell',
      key: 'spell',
      effect: [
        {
          op: 'select',
          as: 'bounce',
          from: [{ zone: 'field', who: 'you' }],
          filter: { kind: ['follower'] },
          count: 1,
          target: true,
        },
        { op: 'returnToHand', cards: 'bounce' },
        { op: 'draw', n: 1 },
      ],
    },
  ],
});
