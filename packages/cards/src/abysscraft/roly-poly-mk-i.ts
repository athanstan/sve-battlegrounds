import { scriptOf } from '../define';

const aenea = { name: 'Aenea, Amethyst Rebel' as const };
const aeneaOnField = { exists: { zone: 'field' as const, who: 'you' as const }, filter: aenea };

export const rolyPolyMkI = scriptOf('roly-poly-mk-i', [
  {
    kind: 'static',
    key: 'cap',
    validIn: ['field'],
    activeIf: aeneaOnField,
    replacement: { would: 'takeDamage', instead: 'modify', amount: 1, cap: true },
  },
  {
    kind: 'activated',
    key: 'rebuild',
    from: 'cemetery',
    label: 'Summon this from your cemetery',
    cost: { playPoints: 1 },
    condition: aeneaOnField,
    effect: [
      { op: 'move', cards: 'self', to: 'field' },
      { op: 'buff', cards: 'self', attack: 1, defense: 0 },
      {
        op: 'grantAbility',
        cards: 'self',
        ability: {
          kind: 'triggered',
          key: 'banishSelf',
          on: 'lastWords',
          effect: [{ op: 'banish', cards: 'self' }],
        },
      },
    ],
  },
]);
