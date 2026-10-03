/**
 * Seeded, immutable random stream (xoshiro128**).
 *
 * The reducer never touches Math.random or Date.now. Every random decision (first-seat
 * pick, shuffles) consumes this stream, whose state lives in the match state, so a match
 * is fully reproducible from its seed and its intent history.
 */
export type RngState = readonly [number, number, number, number];

const UINT32 = 0x1_0000_0000;

/** cyrb128: hash an arbitrary string into four well-mixed 32-bit words. */
function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function seedRng(seed: string): RngState {
  const state = hashSeed(seed);
  // xoshiro must never start from the all-zero state.
  return state.every((word) => word === 0) ? [1, 0, 0, 0] : state;
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Next 32 random bits. */
export function nextUint32(state: RngState): [value: number, next: RngState] {
  const [s0, s1, s2, s3] = state;
  const value = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  return [value, [n0, n1, (n2 ^ t) >>> 0, rotl(n3, 11)]];
}

/** Uniform integer in [0, bound) without modulo bias. */
export function nextInt(state: RngState, bound: number): [value: number, next: RngState] {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32) {
    throw new RangeError(`nextInt bound must be an integer in [1, 2^32], got ${bound}`);
  }
  const limit = UINT32 - (UINT32 % bound);
  let current = state;
  for (;;) {
    const [value, next] = nextUint32(current);
    current = next;
    if (value < limit) return [value % bound, current];
  }
}

/** Fisher-Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(items: readonly T[], state: RngState): [shuffled: T[], next: RngState] {
  const result = [...items];
  let current = state;
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, i + 1);
    current = next;
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  return [result, current];
}
