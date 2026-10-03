import { describe, expect, it } from 'vitest';
import { createCamera, DEFAULT_CAMERA } from '../camera';
import { DESIGN } from '../theme';
import { cornersOf, insideQuad, type QuadPose } from './quad';

const camera = createCamera({ ...DEFAULT_CAMERA, viewport: DESIGN });
const HALF = { w: 60, h: 84 };

const pose = (extra: Partial<QuadPose> = {}): QuadPose => ({
  x: 800,
  y: 480,
  scale: 1,
  rotation: 0,
  flat: 0,
  width: 1,
  ...extra,
});

const size = (c: readonly number[]) => ({
  top: (c[2] ?? 0) - (c[0] ?? 0),
  bottom: (c[4] ?? 0) - (c[6] ?? 0),
  height: (c[7] ?? 0) - (c[1] ?? 0),
});

describe('cornersOf', () => {
  it('is a plain rectangle when the card faces the player', () => {
    const c = cornersOf(camera, pose(), HALF.w, HALF.h);
    expect(c).toEqual([740, 396, 860, 396, 860, 564, 740, 564]);
  });

  it('turns a rotated upright card about its centre', () => {
    const c = cornersOf(camera, pose({ rotation: Math.PI / 2 }), HALF.w, HALF.h);
    expect(c[0]).toBeCloseTo(884, 6);
    expect(c[1]).toBeCloseTo(420, 6);
  });

  it('lays a flat card on the table: shorter than it is wide, far edge narrower than near', () => {
    const c = cornersOf(camera, pose({ flat: 1 }), HALF.w, HALF.h);
    const { top, bottom, height } = size(c);
    expect(height).toBeLessThan(168);
    expect(height).toBeGreaterThan(0);
    expect(top).toBeLessThan(bottom);
    // Mirror-symmetric about the table's centre line.
    expect(((c[0] ?? 0) + (c[2] ?? 0)) / 2).toBeCloseTo(800, 6);
  });

  it('keeps the width it was given where it stands', () => {
    const c = cornersOf(camera, pose({ flat: 1 }), HALF.w, HALF.h);
    const { top, bottom } = size(c);
    expect((top + bottom) / 2).toBeGreaterThan(110);
    expect((top + bottom) / 2).toBeLessThan(130);
  });

  it('blends between standing and lying', () => {
    const upright = size(cornersOf(camera, pose({ flat: 0 }), HALF.w, HALF.h)).height;
    const half = size(cornersOf(camera, pose({ flat: 0.5 }), HALF.w, HALF.h)).height;
    const flat = size(cornersOf(camera, pose({ flat: 1 }), HALF.w, HALF.h)).height;
    expect(flat).toBeLessThan(half);
    expect(half).toBeLessThan(upright);
  });

  it('squeezes a flipping card toward its centre line', () => {
    const c = cornersOf(camera, pose({ flat: 1, width: 0.01 }), HALF.w, HALF.h);
    expect(Math.abs((c[2] ?? 0) - (c[0] ?? 0))).toBeLessThan(2);
  });

  it('falls back to standing where the screen shows no table', () => {
    const c = cornersOf(camera, pose({ y: -4000, flat: 1 }), HALF.w, HALF.h);
    expect(c[1]).toBeCloseTo(-4000 - 84, 6);
  });
});

describe('insideQuad', () => {
  const flat = cornersOf(camera, pose({ flat: 1 }), HALF.w, HALF.h);

  it('picks inside the foreshortened card and not in the box around it', () => {
    expect(insideQuad(flat, 800, 480)).toBe(true);
    expect(insideQuad(flat, 800, 300)).toBe(false);
    // A point in the bounding box but outside the trapezoid's slanted side.
    const topLeft = { x: flat[0] ?? 0, y: flat[1] ?? 0 };
    const bottomLeft = { x: flat[6] ?? 0, y: flat[7] ?? 0 };
    expect(topLeft.x).toBeGreaterThan(bottomLeft.x);
    expect(insideQuad(flat, bottomLeft.x + 0.5, topLeft.y + 0.5)).toBe(false);
  });
});
