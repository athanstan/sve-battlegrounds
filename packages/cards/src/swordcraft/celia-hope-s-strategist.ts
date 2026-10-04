import { scriptOf } from '../define';

export const celiaHopeSStrategistEvolved = scriptOf(
  'celia-hope-s-strategist@evolved',
  [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [{ op: 'token', name: 'Shield Guardian', n: 1, to: 'field' }],
    },
  ],
  { alsoNamed: ['Celia, Sky Commander'] },
);
