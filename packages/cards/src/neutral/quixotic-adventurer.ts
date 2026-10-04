import { scriptOf } from '../define';

export const quixoticAdventurer = scriptOf('quixotic-adventurer', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Dutiful Steed', n: 1, to: 'ex' }],
  },
]);
