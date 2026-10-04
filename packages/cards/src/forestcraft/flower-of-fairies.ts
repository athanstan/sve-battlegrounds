import { scriptOf } from '../define';

export const flowerOfFairies = scriptOf('flower-of-fairies', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Fairy Wisp', n: 1, to: 'ex' }],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { list: [{ engage: true }, { burySelf: true }] },
    label: 'Summon a Fairy token',
    effect: [{ op: 'token', name: 'Fairy', n: 1, to: 'field' }],
  },
]);
