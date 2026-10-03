import { defineCard, printed } from '../define';

export const trialInitiationText = printed(
  'Choose one of the following. (1) Look at the top 2 cards of your deck. You may reveal an Umamusume card from among them and add it to your hand. Put the remaining cards on the bottom of your deck in any order. (2) Select a BNW follower in your cemetery and add it to your hand.',
);

export const trialInitiation = defineCard({
  name: 'Trial Initiation',
  text: trialInitiationText,
  abilities: [
    {
      kind: 'spell',
      key: 'spell',
      effect: [
        {
          op: 'chooseOne',
          options: [
            {
              label: 'Look at the top 2',
              effect: [
                {
                  op: 'lookTop',
                  n: 2,
                  pick: { filter: { universe: 'Umamusume' }, upTo: 1, reveal: true, then: 'hand' },
                  rest: 'bottom',
                },
              ],
            },
            {
              label: 'Return a BNW follower',
              effect: [
                {
                  op: 'select',
                  as: 'bnw',
                  from: [{ zone: 'cemetery', who: 'you' }],
                  filter: { kind: ['follower'], trait: 'BNW' },
                  count: { upTo: 1 },
                },
                { op: 'move', cards: 'bnw', to: 'hand' },
              ],
            },
          ],
        },
      ],
    },
  ],
});
