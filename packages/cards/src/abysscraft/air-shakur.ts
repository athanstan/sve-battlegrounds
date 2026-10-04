import { umaGrave } from '../shared';
import { scriptOf } from '../define';

const twentyUma = umaGrave(20);

export const airShakur = scriptOf('air-shakur', [
  {
    kind: 'static',
    key: 'storm',
    validIn: ['field'],
    activeIf: twentyUma,
    grant: { filter: { self: true }, keywords: ['storm'] },
  },
  {
    kind: 'triggered',
    key: 'strike',
    on: 'strike',
    condition: twentyUma,
    effect: [{ op: 'buff', cards: 'self', attack: 3, defense: 3 }],
  },
  {
    kind: 'triggered',
    key: 'onRace',
    on: 'onRace',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: { upTo: 1 },
      },
      { op: 'damage', to: 'target', amount: 3 },
      { op: 'buff', cards: 'self', attack: 1, defense: 1 },
      { op: 'buryTop', n: 2 },
    ],
  },
]);
