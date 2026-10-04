import { scriptOf } from '../define';

/** An evolved Carrot spell: any of them stands in for "Carrot" in an evolve deck (10 copies). */
export const hungryForAMiracle = scriptOf('hungry-for-a-miracle@evolved', [], {
  alsoNamed: ['Carrot'],
  copyLimit: 10,
});
