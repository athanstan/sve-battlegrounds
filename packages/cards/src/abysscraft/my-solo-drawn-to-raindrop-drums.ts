import { umaGrave } from '../shared';
import { scriptOf } from '../define';

export const mySoloDrawnToRaindropDrums = scriptOf('my-solo-drawn-to-raindrop-drums', [
  {
    kind: 'static',
    key: 'discount',
    validIn: ['hand', 'ex'],
    costDelta: { filter: { self: true }, amount: -2, if: umaGrave(10) },
  },
  {
    kind: 'spell',
    key: 'spell',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: 1,
        target: true,
      },
      { op: 'destroy', cards: 'target' },
    ],
  },
]);
