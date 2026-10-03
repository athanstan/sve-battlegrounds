import { asCardId } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { isComplete, sameSpec, toggle, type SelectionSpec } from './selection';

const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(asCardId) as [
  ReturnType<typeof asCardId>,
  ReturnType<typeof asCardId>,
  ReturnType<typeof asCardId>,
  ReturnType<typeof asCardId>,
];
const spec = (over: Partial<SelectionSpec> = {}): SelectionSpec => ({
  candidates: [a, b, c],
  min: 1,
  max: 2,
  ...over,
});

describe('toggle', () => {
  it('adds a candidate and takes it back on a second click', () => {
    const once = toggle([], a, spec());
    expect(once).toEqual([a]);
    expect(toggle(once, a, spec())).toEqual([]);
  });

  it('ignores cards that are not candidates', () => {
    expect(toggle([a], d, spec())).toEqual([a]);
  });

  it('stops adding once the maximum is reached, but still lets a pick be taken back', () => {
    const full = toggle(toggle([], a, spec()), b, spec());
    expect(toggle(full, c, spec())).toEqual([a, b]);
    expect(toggle(full, a, spec())).toEqual([b]);
  });

  it('moves the pick when exactly one is wanted', () => {
    const one = spec({ max: 1 });
    expect(toggle([a], b, one)).toEqual([b]);
  });
});

describe('isComplete', () => {
  it('holds between the minimum and the maximum', () => {
    expect(isComplete([], spec())).toBe(false);
    expect(isComplete([a], spec())).toBe(true);
    expect(isComplete([a, b], spec())).toBe(true);
    expect(isComplete([], spec({ min: 0 }))).toBe(true);
  });
});

describe('sameSpec', () => {
  it('compares by content, so a re-sent prompt keeps the player’s picks', () => {
    expect(sameSpec(spec(), spec({ candidates: [c, b, a] }))).toBe(true);
    expect(sameSpec(spec(), spec({ max: 3 }))).toBe(false);
    expect(sameSpec(spec(), spec({ candidates: [a, b] }))).toBe(false);
    expect(sameSpec(spec(), null)).toBe(false);
    expect(sameSpec(null, null)).toBe(true);
  });
});
