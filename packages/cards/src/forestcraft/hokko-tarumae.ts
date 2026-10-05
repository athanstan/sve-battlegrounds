import { scriptOf } from '../define';

const umaOnField = {
  count: { zone: 'field' as const, who: 'you' as const },
  filter: { universe: 'Umamusume' },
};

export const hokkoTarumae = scriptOf('hokko-tarumae', [
  {
    kind: 'static',
    key: 'discount',
    validIn: ['hand', 'ex'],
    costDelta: { filter: { self: true }, amount: { neg: umaOnField } },
  },
]);

export const hokkoTarumaeEvolved = scriptOf('hokko-tarumae@evolved', [
  {
    kind: 'triggered',
    key: 'onEvolve',
    on: 'onEvolve',
    effect: [{ op: 'draw', n: 1 }],
  },
]);
