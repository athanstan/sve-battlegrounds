import { scriptOf } from '../define';

/** An evolved Carrot spell: any of them stands in for "Carrot" in an evolve deck (10 copies). */
export const aSuperSuccessfulEvent = scriptOf('a-super-successful-event@evolved', [], {
  alsoNamed: ['Carrot'],
  copyLimit: 10,
});
