import { defineCard, EVOLVE_1, printed } from '../define';

export const fairyWhispererText = printed(EVOLVE_1, '[Fanfare] Draw a card.');

export const fairyWhisperer = defineCard({
  name: 'Fairy Whisperer',
  text: fairyWhispererText,
  abilities: [
    {
      kind: 'triggered',
      key: 'fanfare',
      on: 'fanfare',
      effect: [{ op: 'draw', n: 1 }],
    },
  ],
});

export const fairyWhispererEvolvedText = printed('On Evolve - Draw a card.');

export const fairyWhispererEvolved = defineCard({
  name: 'Fairy Whisperer',
  text: fairyWhispererEvolvedText,
  abilities: [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [{ op: 'draw', n: 1 }],
    },
  ],
});
