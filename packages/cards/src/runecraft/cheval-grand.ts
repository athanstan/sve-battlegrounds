import { umaGrave } from '../shared';
import { scriptOf } from '../define';

const tenUma = umaGrave(10);

export const chevalGrand = scriptOf('cheval-grand', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'select',
        as: 'carrot',
        from: [{ zone: 'evolveDeckRevealed', who: 'you' }],
        filter: { name: 'Carrot' },
        count: { upTo: 1 },
      },
      {
        op: 'if',
        cond: tenUma,
        then: [{ op: 'turnCarrots', faceUp: false, upTo: 1, cards: 'carrot' }],
      },
    ],
  },
]);

export const chevalGrandEvolved = scriptOf('cheval-grand@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [
      {
        op: 'select',
        as: 'target',
        from: [{ zone: 'field', who: 'opponent' }],
        filter: { kind: ['follower'] },
        count: { upTo: 1 },
      },
      {
        op: 'if',
        cond: tenUma,
        then: [{ op: 'damage', to: 'target', amount: 4 }],
        else: [{ op: 'damage', to: 'target', amount: 2 }],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'twice',
    on: {
      enemyDamagedByYouLeavesField: { kind: ['follower'] },
      fromSource: { universe: 'Umamusume' },
    },
    condition: { yourTurn: true },
    perTurn: 2,
    effect: [
      { op: 'draw', n: 1 },
      { op: 'discard', who: 'you', n: 1 },
    ],
  },
]);
