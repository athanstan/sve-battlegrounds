import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

export const progenitorsText = printed(EVOLVE_1, FEED_1, '[Fanfare] Turn up to 2 Carrots face up.');

export const progenitors = defineCard({
  name: 'Progenitors',
  text: progenitorsText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [{ op: 'turnCarrots', faceUp: true, upTo: 2 }],
    },
  ],
});
