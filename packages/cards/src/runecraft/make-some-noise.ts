import { scriptOf } from '../define';

export const makeSomeNoise = scriptOf('make-some-noise', [
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
      {
        op: 'if',
        cond: { exists: { zone: 'field', who: 'you' }, filter: { universe: 'Umamusume' } },
        then: [{ op: 'damage', to: 'target', amount: 4 }],
        else: [{ op: 'damage', to: 'target', amount: 3 }],
      },
    ],
  },
]);
