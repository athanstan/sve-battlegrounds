import { describe, expect, it } from 'vitest';
import { Motion } from './motion';
import { isPulsing, Pacer, shouldRun, type Switch } from './pacing';

describe('shouldRun', () => {
  it('stays stopped when nothing is moving', () => {
    expect(shouldRun({ tweens: 0, pulsing: false })).toBe(false);
  });

  it('runs while a tween is in flight', () => {
    expect(shouldRun({ tweens: 1, pulsing: false })).toBe(true);
    expect(shouldRun({ tweens: 4, pulsing: false })).toBe(true);
  });

  it('stops again once the last tween has completed', () => {
    expect(shouldRun({ tweens: 2, pulsing: false })).toBe(true);
    expect(shouldRun({ tweens: 0, pulsing: false })).toBe(false);
  });

  it('runs while a pulse is on screen, tween or not', () => {
    expect(shouldRun({ tweens: 0, pulsing: true })).toBe(true);
    expect(shouldRun({ tweens: 1, pulsing: true })).toBe(true);
  });
});

describe('isPulsing', () => {
  it('is quiet for a board with nothing to look at', () => {
    expect(isPulsing([], [])).toBe(false);
    expect(isPulsing(['none', 'none'], [false, false])).toBe(false);
  });

  it('pulses for a legal target', () => {
    expect(isPulsing(['none', 'legal'], [false, false])).toBe(true);
  });

  it('does not pulse for a selected card: it holds a steady glow', () => {
    expect(isPulsing(['selected', 'selected'], [false, false])).toBe(false);
  });

  it('pulses while a leader is waited on', () => {
    expect(isPulsing(['none'], [false, true])).toBe(true);
  });

  it('does not pulse for an active leader that is not waited on: that ring is constant', () => {
    // `active` without `waiting` never reaches this predicate at all.
    expect(isPulsing(['none'], [false, false])).toBe(false);
  });

  it('stops pulsing once a legal target becomes selected', () => {
    expect(isPulsing(['legal'], [])).toBe(true);
    expect(isPulsing(['selected'], [])).toBe(false);
  });
});

/** A ticker that only counts what it was told. */
function fakeTicker(): Switch & { running: boolean; starts: number; stops: number } {
  const ticker = {
    running: false,
    starts: 0,
    stops: 0,
    start() {
      if (ticker.running) return;
      ticker.running = true;
      ticker.starts++;
    },
    stop() {
      if (!ticker.running) return;
      ticker.running = false;
      ticker.stops++;
    },
  };
  return ticker;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Pacer', () => {
  it('draws one frame for a change that is not a tween, then stops', () => {
    const ticker = fakeTicker();
    const pacer = new Pacer(ticker, () => ({ tweens: 0, pulsing: false }));

    pacer.wake();
    expect(ticker.running).toBe(true);
    pacer.settle(); // the frame that synced and drew the change
    expect(ticker.running).toBe(false);
    expect(ticker.starts).toBe(1);
  });

  it('keeps running while something moves, and stops on the frame it settles', () => {
    const ticker = fakeTicker();
    let tweens = 2;
    let pulsing = true;
    const pacer = new Pacer(ticker, () => ({ tweens, pulsing }));

    pacer.wake();
    pacer.settle();
    expect(ticker.running).toBe(true);
    tweens = 0;
    pacer.settle();
    expect(ticker.running).toBe(true); // still pulsing
    pulsing = false;
    pacer.settle();
    expect(ticker.running).toBe(false);
  });

  it('is not restarted by anything once closed', () => {
    const ticker = fakeTicker();
    const pacer = new Pacer(ticker, () => ({ tweens: 0, pulsing: false }));
    pacer.close();
    pacer.wake();
    expect(ticker.running).toBe(false);
  });

  describe('with a Motion', () => {
    const wired = (enabled: boolean) => {
      const ticker = fakeTicker();
      const motion = new Motion(enabled);
      const pacer = new Pacer(ticker, () => ({ tweens: motion.active, pulsing: false }));
      motion.onChange = () => pacer.wake();
      return { ticker, motion, pacer };
    };

    it('runs for a tween and stops after it completes', async () => {
      const { ticker, motion, pacer } = wired(true);
      const pose = { x: 0 };

      motion.to(pose, { x: 10, duration: 0.05 });
      expect(ticker.running).toBe(true);
      pacer.settle();
      expect(ticker.running).toBe(true);

      await sleep(250);
      expect(pose.x).toBe(10);
      pacer.settle();
      expect(ticker.running).toBe(false);
    });

    it('paints a reduced-motion snap once and leaves nothing running', () => {
      const { ticker, motion, pacer } = wired(false);
      const pose = { x: 0 };

      motion.to(pose, { x: 10, duration: 0.5 });
      expect(pose.x).toBe(10);
      expect(ticker.running).toBe(true); // a frame is owed
      pacer.settle();
      expect(ticker.running).toBe(false); // and nothing keeps it going
      expect(ticker.starts).toBe(1);
    });

    it('paints an instant assignment once', () => {
      const { ticker, motion, pacer } = wired(true);
      const pose = { x: 0 };

      motion.to(pose, { x: 3, duration: 0.5 }, true);
      expect(pose.x).toBe(3);
      pacer.settle();
      expect(ticker.running).toBe(false);
    });
  });
});
