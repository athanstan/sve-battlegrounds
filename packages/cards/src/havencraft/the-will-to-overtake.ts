import { scriptOf } from '../define';

export const theWillToOvertake = scriptOf('the-will-to-overtake', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'lookTop',
        n: 3,
        pick: { upTo: 3, reveal: false, then: 'top' },
        rest: 'bottom',
      },
    ],
  },
  {
    kind: 'activated',
    key: 'draw',
    label: 'Draw a card',
    cost: { list: [{ playPoints: 2 }, { engage: true }, { burySelf: true }] },
    effect: [{ op: 'draw', n: 1 }],
  },
]);
