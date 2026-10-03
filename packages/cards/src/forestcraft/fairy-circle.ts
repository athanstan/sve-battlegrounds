import { defineCard, printed } from '../define';

export const fairyCircleText = printed('Put 2 Fairy tokens into your EX area.');

export const fairyCircle = defineCard({
  name: 'Fairy Circle',
  text: fairyCircleText,
  abilities: [
    { kind: 'spell', key: 'spell', effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'ex' }] },
  ],
});
