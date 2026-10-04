import { wasteland } from '../shared';
import { scriptOf } from '../define';

export const tyrantSOrder = scriptOf(
  'tyrant-s-order',
  [
    {
      kind: 'spell',
      key: 'spell',
      effect: [
        {
          op: 'select',
          as: 'target',
          from: [{ zone: 'field', who: 'opponent' }],
          filter: { kind: ['follower'], boxed: true },
          count: { upTo: 1 },
          target: true,
        },
        { op: 'destroy', cards: 'target' },
        {
          op: 'search',
          as: 'found',
          filter: { kind: ['follower'], ...wasteland },
          count: 1,
          reveal: true,
          then: 'hand',
        },
      ],
    },
  ],
  { allPrintings: true },
);
