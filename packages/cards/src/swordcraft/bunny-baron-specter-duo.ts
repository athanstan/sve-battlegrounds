import { scriptOf } from '../define';

export const bunnyBaronSpecterDuo = scriptOf('bunny-baron-specter-duo', []);

export const bunnyBaronSpecterDuoEvolved = scriptOf(
  'bunny-baron-specter-duo@evolved',
  [
    {
      kind: 'triggered',
      key: 'onEvolve',
      on: 'onEvolve',
      effect: [
        {
          op: 'chooseOne',
          options: [
            {
              label: 'Summon Val, Trusty Getaway Car',
              effect: [{ op: 'token', name: 'Val, Trusty Getaway Car', n: 1, to: 'field' }],
            },
            {
              label: "Search for Desperados' Shot",
              effect: [
                {
                  op: 'search',
                  as: 'found',
                  filter: { name: "Desperados' Shot" },
                  count: 1,
                  reveal: true,
                  then: 'hand',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  { allPrintings: true },
);
