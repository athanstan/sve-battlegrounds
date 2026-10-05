import type { Highlight } from './actors';

/**
 * When the canvas draws.
 *
 * A settled board is a still picture, so it is drawn once and then the Pixi ticker is stopped.
 * The ticker runs only while something on the mat is changing from frame to frame:
 *
 *  - a tween is in flight (card travel, flip, hover and pick lift, every cue flourish), or
 *  - a pulse is on screen that the tweens do not drive: the glow of a legal target, and the
 *    ring of a leader the match is waiting on.
 *
 * Anything else that changes the picture (a new view, a selection, a resize, late art) is not
 * a motion. It asks for a frame with `wake`; that frame syncs and draws, finds nothing moving,
 * and the ticker stops again.
 */

/** What is going on right now. */
export interface Activity {
  /** Tweens in flight on this mat. */
  readonly tweens: number;
  /** A legal-target glow or a waiting-leader ring is visible. */
  readonly pulsing: boolean;
}

/** Does the next frame need to happen after this one? */
export function shouldRun(activity: Activity): boolean {
  return activity.tweens > 0 || activity.pulsing;
}

/**
 * Is anything on the board pulsing? Only a `legal` glow is: a selected card holds a steady
 * alpha of 1, and an active leader whose turn is not being waited on holds a steady ring.
 */
export function isPulsing(highlights: Iterable<Highlight>, waiting: Iterable<boolean>): boolean {
  for (const highlight of highlights) if (highlight === 'legal') return true;
  for (const isWaiting of waiting) if (isWaiting) return true;
  return false;
}

/** The part of a Pixi `Ticker` this needs. */
export interface Switch {
  start(): void;
  stop(): void;
}

/**
 * Runs and stops a ticker as the mat's activity comes and goes.
 *
 * The ticker's own listener calls `settle` last, after it has synced the scene. Pixi renders
 * after every listener of that frame, even one that stopped the ticker, so the frame on which
 * the last thing stops is still drawn, with the final values.
 */
export class Pacer {
  readonly #ticker: Switch;
  readonly #activity: () => Activity;
  #closed = false;

  constructor(ticker: Switch, activity: () => Activity) {
    this.#ticker = ticker;
    this.#activity = activity;
  }

  /** Something changed. Make sure a frame follows. Starting a running ticker does nothing. */
  wake(): void {
    if (!this.#closed) this.#ticker.start();
  }

  /** End of a frame: stop if nothing is moving. */
  settle(): void {
    if (!shouldRun(this.#activity())) this.#ticker.stop();
  }

  /** The mat is going away; nothing may restart the ticker. */
  close(): void {
    this.#closed = true;
  }
}
