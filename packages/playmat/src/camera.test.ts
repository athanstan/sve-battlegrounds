import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, createCamera } from './camera';

const camera = createCamera({ ...DEFAULT_CAMERA, viewport: { width: 1600, height: 900 } });

describe('camera', () => {
  it('puts the centre of the table at the middle of the frame, at natural size', () => {
    expect(camera.project(0, 0)).toEqual({ x: 800, y: DEFAULT_CAMERA.centreY, scale: 1 });
  });

  it('makes the far side smaller and the near side larger', () => {
    const far = camera.project(0, -500);
    const near = camera.project(0, 500);
    expect(far.scale).toBeLessThan(1);
    expect(near.scale).toBeGreaterThan(1);
    expect(far.y).toBeLessThan(DEFAULT_CAMERA.centreY);
    expect(near.y).toBeGreaterThan(DEFAULT_CAMERA.centreY);
  });

  it('makes far cards only a little smaller than near ones, as in the reference frames', () => {
    // The two hand rows are the extremes: the far hand must not shrink to a speck.
    const ratio = camera.project(0, -420).scale / camera.project(0, 330).scale;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.85);
  });

  it('is mirror-symmetric left to right', () => {
    const left = camera.project(-300, 200);
    const right = camera.project(300, 200);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.scale).toBeCloseTo(right.scale);
    expect(left.x + right.x).toBeCloseTo(1600);
  });

  it('converges: parallel table lines meet toward the far side', () => {
    const nearGap = camera.project(300, 400).x - camera.project(-300, 400).x;
    const farGap = camera.project(300, -400).x - camera.project(-300, -400).x;
    expect(farGap).toBeLessThan(nearGap);
  });

  it('gives rows on the far side less vertical room, which is what depth looks like', () => {
    const near = camera.project(0, 200).y - camera.project(0, 100).y;
    const far = camera.project(0, -100).y - camera.project(0, -200).y;
    expect(far).toBeLessThan(near);
  });

  it('is tilted well below overhead, like a table seen across a room', () => {
    expect(DEFAULT_CAMERA.pitch).toBeLessThan(50);
    // A card lying flat is noticeably shorter than it is wide.
    const top = camera.project(0, 0);
    const bottom = camera.project(0, 100);
    expect(bottom.y - top.y).toBeLessThan(80);
  });

  it('traces a screen point back to the table point it shows', () => {
    for (const [x, y] of [
      [0, 0],
      [320, -250],
      [-540, 410],
      [90, -480],
    ] as const) {
      const shown = camera.project(x, y);
      const back = camera.unproject(shown.x, shown.y);
      expect(back?.x).toBeCloseTo(x, 6);
      expect(back?.y).toBeCloseTo(y, 6);
      expect(back?.scale).toBeCloseTo(shown.scale, 9);
    }
  });

  it('has no table point above the horizon', () => {
    expect(camera.unproject(800, -5000)).toBeNull();
    expect(camera.tryProject(0, 5000)).toBeNull();
  });

  it('refuses points behind the camera and nonsense distances', () => {
    expect(() => camera.project(0, 5000)).toThrow(/behind the camera/);
    expect(() =>
      createCamera({ ...DEFAULT_CAMERA, distance: 0, viewport: { width: 1, height: 1 } }),
    ).toThrow();
  });
});
