import { umaGrave } from '../shared';
import { scriptOf } from '../define';

export const manhattanCafe = scriptOf('manhattan-cafe', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'buryTop', n: 1 }],
  },
  {
    kind: 'activated',
    key: 'act',
    cost: { list: [{ engage: true }, { burySelf: true }] },
    condition: umaGrave(10),
    label: 'Summon a 2-cost Umamusume follower',
    effect: [
      {
        op: 'select',
        as: 'picked',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { kind: ['follower'], universe: 'Umamusume', costIs: 2 },
        count: 1,
      },
      { op: 'move', cards: 'picked', to: 'field' },
    ],
  },
]);
