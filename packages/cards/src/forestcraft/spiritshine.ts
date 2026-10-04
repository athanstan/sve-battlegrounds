import { pixieToken } from '../shared';
import { scriptOf } from '../define';

export const spiritshine = scriptOf(
  'spiritshine',
  [
    {
      kind: 'spell',
      key: 'spell',
      effect: [
        {
          op: 'chooseOne',
          options: [
            {
              label: 'Give a Pixie token +2/+2',
              effect: [
                {
                  op: 'select',
                  as: 'pixie',
                  from: [
                    { zone: 'field', who: 'you' },
                    { zone: 'ex', who: 'you' },
                  ],
                  filter: pixieToken,
                  count: 1,
                },
                { op: 'buff', cards: 'pixie', attack: 2, defense: 2 },
              ],
            },
            {
              label: 'Put 2 Fairy tokens into EX',
              effect: [{ op: 'token', name: 'Fairy', n: 2, to: 'ex' }],
            },
          ],
        },
      ],
    },
  ],
  { allPrintings: true },
);
