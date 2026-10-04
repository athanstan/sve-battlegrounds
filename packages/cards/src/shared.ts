export const umaGrave = (n: number) =>
  ({
    atLeast: n,
    value: {
      count: { zone: 'cemetery' as const, who: 'you' as const },
      filter: { universe: 'Umamusume' },
    },
  }) as const;

export const pixieToken = { token: true as const, pixie: true as const };
export const pixieFollower = { kind: ['follower'] as const, pixie: true as const };

export const mount = { trait: 'Mount' as const };
export const wasteland = { trait: 'Wasteland' as const };
export const nahtnaught = { name: 'Nahtnaught, Cursed Queen' as const };

export const mountSomewhere = {
  atLeast: 1,
  value: {
    sum: [
      { count: { zone: 'field' as const, who: 'you' as const }, filter: mount },
      { count: { zone: 'ex' as const, who: 'you' as const }, filter: mount },
    ],
  },
} as const;

export const twoMounts = {
  atLeast: 2,
  value: {
    sum: [
      { count: { zone: 'field' as const, who: 'you' as const }, filter: mount },
      { count: { zone: 'ex' as const, who: 'you' as const }, filter: mount },
    ],
  },
} as const;

export const enemyFollower = {
  kind: ['follower'] as const,
} as const;

export const enemyLeaderOrFollower = [
  { zone: 'field' as const, who: 'opponent' as const },
  { zone: 'leader' as const, who: 'opponent' as const },
] as const;
