import { scriptOf } from '../define';

/** An evolved Carrot spell: any of them stands in for "Carrot" in an evolve deck (10 copies). */
export const workshopFarmersForADay = scriptOf('workshop-farmers-for-a-day@evolved', [], {
  alsoNamed: ['Carrot'],
  copyLimit: 10,
});
