import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };
const otherMachina = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { ...machinaFollower, other: true as const },
};

export const monoImmortalGarnet = scriptOf('mono-immortal-garnet', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'token', name: 'Assembly Droid', n: 1, to: 'field' }],
  },
  {
    kind: 'triggered',
    key: 'strike',
    on: 'strike',
    effect: [
      {
        op: 'select',
        as: 'foe',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
      },
      { op: 'damage', to: 'foe', amount: otherMachina },
    ],
  },
  {
    kind: 'activated',
    key: 'storm',
    label: 'Gain +1/+1 and Storm',
    perTurn: 1,
    cost: { playPoints: 0 },
    condition: {
      atLeast: 5,
      value: { count: { zone: 'field', who: 'you' }, filter: machinaFollower },
    },
    effect: [
      { op: 'buff', cards: 'self', attack: 1, defense: 1 },
      { op: 'grant', cards: 'self', keywords: ['storm'] },
    ],
  },
]);
