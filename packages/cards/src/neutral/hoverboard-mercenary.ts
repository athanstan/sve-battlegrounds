import { scriptOf } from '../define';

const drones = [
  { op: 'token' as const, name: 'Assembly Droid', n: 1, to: 'field' as const },
  { op: 'token' as const, name: 'Repair Mode', n: 1, to: 'ex' as const },
];

export const hoverboardMercenary = scriptOf('hoverboard-mercenary', [
  { kind: 'triggered', key: 'fanfare', on: 'fanfare', effect: drones },
]);

export const hoverboardMercenaryEvolved = scriptOf('hoverboard-mercenary@evolved', [
  { kind: 'triggered', key: 'onEvolve', on: 'onEvolve', effect: drones },
]);
