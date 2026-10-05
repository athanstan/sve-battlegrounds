import { scriptOf } from '../define';

const uma = { universe: 'Umamusume' as const };

export const aMoreMarvelousWorld = scriptOf('a-more-marvelous-world', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'lookTop',
        n: 1,
        pick: { filter: uma, upTo: 1, reveal: true, then: 'hand' },
        rest: 'top',
      },
    ],
  },
  {
    kind: 'activated',
    key: 'shield',
    label: 'Give your leader +2 defense',
    cost: { list: [{ playPoints: 2 }, { engage: true }, { burySelf: true }] },
    effect: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
  },
]);
