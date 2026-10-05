import { scriptOf } from '../define';

const machinaFollower = { kind: ['follower'] as const, trait: 'Machina' as const };
const fiveMachina = {
  atLeast: 5,
  value: { count: { zone: 'field' as const, who: 'you' as const }, filter: machinaFollower },
};

export const monoGarnetRebel = scriptOf('mono-garnet-rebel', [
  {
    kind: 'static',
    key: 'evolveGate',
    validIn: ['field'],
    evolveIf: fiveMachina,
  },
  {
    kind: 'activated',
    key: 'droid',
    label: 'Summon an Assembly Droid',
    perTurn: 1,
    cost: { playPoints: 0 },
    condition: {
      atLeast: 2,
      value: {
        count: { zone: 'cemetery', who: 'you' },
        filter: { trait: 'Machina' },
      },
    },
    effect: [
      {
        op: 'select',
        as: 'fuel',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { trait: 'Machina' },
        count: 2,
      },
      { op: 'banish', cards: 'fuel' },
      { op: 'token', name: 'Assembly Droid', n: 1, to: 'field' },
    ],
  },
]);

export const monoGarnetRebelEvolved = scriptOf('mono-garnet-rebel@evolved', [
  {
    kind: 'activated',
    key: 'overdrive',
    label: 'Buff Machina followers',
    perTurn: 1,
    cost: { playPoints: 2 },
    condition: {
      exists: { zone: 'cemetery', who: 'you' },
      filter: { name: 'Alpha Drive' },
    },
    effect: [
      {
        op: 'select',
        as: 'drive',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { name: 'Alpha Drive' },
        count: 1,
      },
      { op: 'banish', cards: 'drive' },
      { op: 'buff', cards: { each: { zone: 'field', who: 'you' }, filter: machinaFollower }, attack: 2, defense: 2 },
      {
        op: 'grant',
        cards: { each: { zone: 'field', who: 'you' }, filter: machinaFollower },
        keywords: ['rush'],
      },
    ],
  },
]);
