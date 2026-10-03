import { defineCard, printed } from '../define';

export const sevenMoreCentimetersText = printed(
  'This card can only be played if there are at least 20 Umamusume cards in your cemetery. Destroy each enemy follower on the field. Draw 3 cards. Each opponent discards 3 cards.',
);

export const sevenMoreCentimeters = defineCard({
  name: '7 More Centimeters',
  text: sevenMoreCentimetersText,
  abilities: [
    {
      kind: 'static',
      key: 'restriction',
      validIn: ['hand'],
      playRestriction: {
        atLeast: 20,
        value: { count: { zone: 'cemetery', who: 'you' }, filter: { universe: 'Umamusume' } },
      },
    },
    {
      kind: 'spell',
      key: 'spell',
      effect: [
        {
          op: 'select',
          as: 'enemies',
          from: [{ zone: 'field', who: 'opponent' }],
          filter: { kind: ['follower'] },
          count: 'any',
        },
        { op: 'destroy', cards: 'enemies' },
        { op: 'draw', n: 3 },
        { op: 'discard', who: 'opponent', n: 3 },
      ],
    },
  ],
});
