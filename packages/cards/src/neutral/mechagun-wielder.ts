import { scriptOf } from '../define';

export const mechagunWielder = scriptOf('mechagun-wielder', [
  {
    kind: 'triggered',
    key: 'fanfare',
    on: 'fanfare',
    effect: [
      {
        op: 'chooseOne',
        options: [
          {
            label: 'Put an Assembly Droid into your EX area',
            effect: [{ op: 'token', name: 'Assembly Droid', n: 1, to: 'ex' }],
          },
          {
            label: 'Put a Repair Mode into your EX area',
            effect: [{ op: 'token', name: 'Repair Mode', n: 1, to: 'ex' }],
          },
        ],
      },
    ],
  },
  {
    kind: 'triggered',
    key: 'lastWords',
    on: 'lastWords',
    effect: [
      {
        op: 'optional',
        label: 'Discard a Machina',
        cost: [{ op: 'discard', who: 'you', n: 1, filter: { trait: 'Machina' }, as: 'paid' }],
        then: [{ op: 'if', cond: { did: 'paid' }, then: [{ op: 'draw', n: 1 }] }],
      },
    ],
  },
]);
