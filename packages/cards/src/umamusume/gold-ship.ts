import { defineCard, EVOLVE_1, FEED_1, printed } from '../define';

export const goldShipText = printed(EVOLVE_1, FEED_1, 'Storm.');

export const goldShip = defineCard({
  name: 'Gold Ship',
  text: goldShipText,
  abilities: [],
});

export const goldShipEvolvedText = printed('Storm.');

export const goldShipEvolved = defineCard({
  name: 'Gold Ship',
  text: goldShipEvolvedText,
  abilities: [],
});
