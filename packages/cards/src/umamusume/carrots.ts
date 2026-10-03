import { defineCard, printed } from '../define';

const carrotAbility = printed(
  'You can serve a Carrot to an Umamusume follower to race it. (Racing followers have Rush.)',
  'You can put up to 10 of this card into your evolve deck.',
);

export const carrotText = carrotAbility;
export const miracleCarrotText = printed('Miracle Carrot.', carrotAbility);
export const victoryCarrotText = printed('Victory Carrot.', carrotAbility);

export const carrot = defineCard({
  name: 'Carrot',
  text: carrotText,
  alsoNamed: ['Carrot'],
  abilities: [],
});

export const miracleCarrot = defineCard({
  name: 'Miracle Carrot',
  text: miracleCarrotText,
  alsoNamed: ['Carrot'],
  abilities: [],
});

export const victoryCarrot = defineCard({
  name: 'Victory Carrot',
  text: victoryCarrotText,
  alsoNamed: ['Carrot'],
  abilities: [],
});
