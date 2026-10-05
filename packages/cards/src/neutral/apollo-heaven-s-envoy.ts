import { scriptOf } from '../define';

const smite = [
  { op: 'damage' as const, to: 'enemyLeader', amount: 1 },
  {
    op: 'damage' as const,
    to: {
      each: { zone: 'field' as const, who: 'opponent' as const },
      filter: { kind: ['follower'] as const },
    },
    amount: 1,
  },
];

export const apolloHeavenSEnvoy = scriptOf('apollo-heaven-s-envoy', [
  { kind: 'triggered', key: 'fanfare', on: 'fanfare', effect: smite },
]);

export const apolloHeavenSEnvoyEvolved = scriptOf('apollo-heaven-s-envoy@evolved', [
  { kind: 'triggered', key: 'onEvolve', on: 'onEvolve', effect: smite },
]);
