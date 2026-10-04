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
export const mage = { trait: 'Mage' as const };
export const mageFollower = { kind: ['follower'] as const, trait: 'Mage' as const };
export const mageSpell = { kind: ['spell'] as const, trait: 'Mage' as const };
export const runecraftSpell = { kind: ['spell'] as const, cardClass: 'runecraft' as const };

export const mageGrave = (n: number) =>
  ({
    atLeast: n,
    value: {
      count: { zone: 'cemetery' as const, who: 'you' as const },
      filter: mageFollower,
    },
  }) as const;

export const mageField = (n: number) =>
  ({
    atLeast: n,
    value: {
      count: { zone: 'field' as const, who: 'you' as const },
      filter: mageFollower,
    },
  }) as const;

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
