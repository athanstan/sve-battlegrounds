import { scriptOf } from '../define';

export const daiwaScarlet = scriptOf('daiwa-scarlet', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'search',
        as: 'found',
        filter: { kind: ['spell'], universe: 'Umamusume' },
        count: 1,
        reveal: true,
        then: 'hand',
      },
    ],
  },
  {
    kind: 'static',
    key: 'firstSpell',
    validIn: ['field'],
    costDelta: { filter: { kind: ['spell'], universe: 'Umamusume' }, amount: -1, nthSpell: 1 },
  },
  {
    kind: 'triggered',
    key: 'thirdSpell',
    on: { youPlaySpell: { nth: 3 } },
    effect: [
      {
        op: 'select',
        as: 'ally',
        from: [{ zone: 'field', who: 'you' }],
        filter: { kind: ['follower'], universe: 'Umamusume', other: true },
        count: { upTo: 1 },
      },
      { op: 'grant', cards: 'self', keywords: ['storm'] },
      { op: 'grant', cards: 'ally', keywords: ['storm'] },
    ],
  },
]);
