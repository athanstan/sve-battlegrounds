import { mountSomewhere, wasteland } from '../shared';
import { scriptOf } from '../define';

export const wanderingChef = scriptOf('wandering-chef', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'if',
        cond: mountSomewhere,
        then: [{ op: 'leaderDefense', who: 'you', delta: 2 }],
      },
    ],
  },
]);

export const wanderingChefEvolved = scriptOf('wandering-chef@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'lookTop',
        n: 4,
        pick: { filter: wasteland, upTo: 1, reveal: true, then: 'hand' },
        rest: 'bottom',
      },
    ],
  },
]);
