import { scriptOf } from '../define';

export const fairyCircle = scriptOf('fairy-circle', [
  { kind: 'spell', key: 'spell', effect: [{ op: 'token', name: 'Fairy', n: 3, to: 'ex' }] },
]);
