import { scriptOf } from '../define';

export const matikanetannhauser = scriptOf('matikanetannhauser-machitan-adventure', [
  {
    kind: 'triggered',
    key: 'onRace',
    on: 'onRace',
    effect: [
      {
        op: 'select',
        as: 'picked',
        from: [{ zone: 'cemetery', who: 'you' }],
        filter: { kind: ['follower'], universe: 'Umamusume', costAtMost: 3 },
        count: { upTo: 1 },
      },
      { op: 'move', cards: 'picked', to: 'field' },
      { op: 'buff', cards: 'self', attack: 1, defense: 1 },
    ],
  },
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [{ op: 'buryTop', n: 1 }],
  },
]);
