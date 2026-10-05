import { describe, expect, it, vi } from 'vitest';
import { Motion } from './motion';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Motion.active', () => {
  it('is zero before anything is animated', () => {
    expect(new Motion(true).active).toBe(0);
  });

  it('counts a tween from the call until it completes', async () => {
    const motion = new Motion(true);
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 0.05 });
    expect(motion.active).toBe(1);

    await sleep(250);
    expect(pose.x).toBe(10);
    expect(motion.active).toBe(0);
  });

  it('still runs the caller’s onComplete', async () => {
    const motion = new Motion(true);
    const done = vi.fn();

    motion.to({ x: 0 }, { x: 1, duration: 0.03, onComplete: done });
    await sleep(200);

    expect(done).toHaveBeenCalledTimes(1);
    expect(motion.active).toBe(0);
  });

  it('counts a tween that waits out a delay', async () => {
    const motion = new Motion(true);

    motion.to({ x: 0 }, { x: 1, duration: 0.03, delay: 0.1 });
    await sleep(40);
    expect(motion.active).toBe(1);

    await sleep(300);
    expect(motion.active).toBe(0);
  });

  it('drops a tween that is overwritten by another on the same property', async () => {
    const motion = new Motion(true);
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 0.2 });
    await sleep(30);
    motion.to(pose, { x: 20, duration: 0.05 });
    expect(motion.active).toBeGreaterThanOrEqual(1);

    await sleep(300);
    expect(pose.x).toBe(20);
    expect(motion.active).toBe(0);
  });

  it('drops a tween that is replaced before it has started', async () => {
    const motion = new Motion(true);
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 0.2 });
    motion.to(pose, { x: 20, duration: 0.05 });
    await sleep(300);

    expect(motion.active).toBe(0);
  });

  it('drops a tween that is killed', async () => {
    const motion = new Motion(true);
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 5 });
    await sleep(30);
    expect(motion.active).toBe(1);

    motion.kill(pose);
    expect(motion.active).toBe(0);
  });

  it('drops a tween that an instant assignment cuts short', async () => {
    const motion = new Motion(true);
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 5 });
    await sleep(30);
    motion.to(pose, { x: 7 }, true);

    expect(pose.x).toBe(7);
    expect(motion.active).toBe(0);
  });

  it('counts a burst, and releases it when something else takes its target', async () => {
    const motion = new Motion(true);
    const pulse = { amount: 0 };

    motion.burst(pulse, { amount: 1 }, { amount: 0, duration: 5 });
    expect(motion.active).toBe(1);
    motion.burst(pulse, { amount: 1 }, { amount: 0, duration: 0.05 });
    await sleep(300);

    expect(motion.active).toBe(0);
  });

  it('counts a keyframed flourish once, and releases it on completion or kill', async () => {
    const motion = new Motion(true);
    const wobble = { x: 0 };

    motion.steps(wobble, [
      { x: 4, duration: 0.02 },
      { x: 0, duration: 0.02 },
    ]);
    expect(motion.active).toBe(1);
    await sleep(250);
    expect(motion.active).toBe(0);

    motion.steps(wobble, [
      { x: 4, duration: 3 },
      { x: 0, duration: 3 },
    ]);
    await sleep(30);
    expect(motion.active).toBe(1);
    motion.kill(wobble);
    expect(motion.active).toBe(0);
  });

  it('counts only its own tweens', () => {
    const a = new Motion(true);
    const b = new Motion(true);
    const target = { x: 0 };
    const other = { x: 0 };

    a.to(target, { x: 1, duration: 5 });
    expect(a.active).toBe(1);
    expect(b.active).toBe(0);

    b.to(other, { x: 1, duration: 5 });
    a.kill(target);
    expect(a.active).toBe(0);
    expect(b.active).toBe(1);
    b.kill(other);
  });
});

describe('Motion with motion off', () => {
  it('snaps, starts no tween, and says so once', () => {
    const motion = new Motion(false);
    const changed = vi.fn();
    motion.onChange = changed;
    const pose = { x: 0 };

    motion.to(pose, { x: 10, duration: 0.5 });

    expect(pose.x).toBe(10);
    expect(motion.active).toBe(0);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('skips flourishes outright', () => {
    const motion = new Motion(false);
    const changed = vi.fn();
    motion.onChange = changed;

    motion.burst({ a: 0 }, { a: 1 }, { a: 0, duration: 1 });
    motion.steps({ x: 0 }, [{ x: 1, duration: 1 }]);

    expect(motion.active).toBe(0);
    expect(changed).not.toHaveBeenCalled();
  });
});
