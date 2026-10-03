import { describe, expect, it } from 'vitest';
import { nextInt, nextUint32, seedRng, shuffle } from './rng';

describe('seeded RNG', () => {
  it('produces the same stream for the same seed', () => {
    const draw = (seed: string) => {
      let state = seedRng(seed);
      const values: number[] = [];
      for (let i = 0; i < 8; i++) {
        const [value, next] = nextUint32(state);
        values.push(value);
        state = next;
      }
      return values;
    };
    expect(draw('alpha')).toEqual(draw('alpha'));
    expect(draw('alpha')).not.toEqual(draw('beta'));
  });

  it('never mutates the state it is given', () => {
    const state = seedRng('immutable');
    const copy = [...state];
    nextUint32(state);
    nextInt(state, 6);
    expect([...state]).toEqual(copy);
  });

  it('keeps nextInt inside its bound and covers every value', () => {
    let state = seedRng('bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const [value, next] = nextInt(state, 6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
      state = next;
    }
    expect(seen.size).toBe(6);
  });

  it('rejects bounds that cannot be sampled', () => {
    const state = seedRng('x');
    expect(() => nextInt(state, 0)).toThrow(RangeError);
    expect(() => nextInt(state, 1.5)).toThrow(RangeError);
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = Array.from({ length: 40 }, (_, i) => i);
    const [shuffled] = shuffle(input, seedRng('shuffle'));
    expect(input).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
    expect(shuffled).not.toEqual(input);
  });

  it('shuffles deterministically and advances the stream', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const start = seedRng('stream');
    const [first, afterFirst] = shuffle(input, start);
    const [again] = shuffle(input, start);
    const [second] = shuffle(input, afterFirst);
    expect(again).toEqual(first);
    expect(second).not.toEqual(first);
  });
});
