import gsap from 'gsap';

/**
 * Every animation on the mat goes through here, so there is one switch for them all.
 *
 * With motion off (the viewer prefers reduced motion, or a snapshot is being laid down) a move
 * lands instantly: the board ends up in exactly the same place, only the journey is skipped.
 * Decorative flourishes - pulses, shakes - simply do not play.
 *
 * It also knows how many of this mat's tweens are in flight (`active`), so the canvas can stop
 * drawing when none are. GSAP's own timeline is process-wide and is not asked.
 */
export class Motion {
  enabled: boolean;

  /**
   * Told every time a call here changes what the board shows or will show: a tween starts, or a
   * value is set outright. The mat uses it to draw a frame for the change.
   */
  onChange: (() => void) | null = null;

  /** One token per tween in flight. A set, so a tween that reports twice is still counted once. */
  readonly #live = new Set<object>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** How many tweens this motion started that have neither finished nor been replaced. */
  get active(): number {
    return this.#live.size;
  }

  /** Move `target` to `vars`, or put it there outright when motion is off or `instant`. */
  to<T extends object>(target: T, vars: gsap.TweenVars, instant = false): void {
    if (!this.enabled || instant) {
      const { duration: _d, delay: _w, ease: _e, onComplete, ...values } = vars;
      this.kill(target);
      Object.assign(target, values);
      onComplete?.();
      this.onChange?.();
      return;
    }
    gsap.to(
      target,
      this.#tracked({ overwrite: 'auto', duration: 0.4, ease: 'power2.out', ...vars }),
    );
    this.onChange?.();
  }

  /** A flourish: jump to `from`, then settle to `to`. Skipped when motion is off. */
  burst<T extends object>(target: T, from: gsap.TweenVars, to: gsap.TweenVars): void {
    if (!this.enabled) return;
    gsap.fromTo(target, from, this.#tracked({ overwrite: 'auto', ease: 'power2.out', ...to }));
    this.onChange?.();
  }

  /** A flourish in several steps. Skipped when motion is off. */
  steps<T extends object>(target: T, steps: gsap.TweenVars[]): void {
    if (!this.enabled) return;
    gsap.to(target, this.#tracked({ overwrite: 'auto', keyframes: steps }));
    this.onChange?.();
  }

  /**
   * Stop every tween on `target`. Each is killed whole, rather than through `killTweensOf`: once
   * an `overwrite: 'auto'` tween has run, GSAP leaves a keyframed tween (`steps`) running when
   * asked to kill it by target, and a flourish that outlives its owner is still counted.
   */
  kill(target: object): void {
    for (const tween of gsap.getTweensOf(target)) tween.kill();
  }

  /**
   * Count the tween these vars will make. GSAP calls exactly one of `onComplete` and
   * `onInterrupt` for a tween, whether it ran out, was killed, or was overwritten by a newer one;
   * either releases it. The caller's own callbacks still run.
   */
  #tracked(vars: gsap.TweenVars): gsap.TweenVars {
    const token = {};
    this.#live.add(token);
    const { onComplete, onInterrupt } = vars;
    return {
      ...vars,
      onComplete: (...args: unknown[]) => {
        this.#live.delete(token);
        (onComplete as ((...a: unknown[]) => void) | undefined)?.(...args);
      },
      onInterrupt: (...args: unknown[]) => {
        this.#live.delete(token);
        (onInterrupt as ((...a: unknown[]) => void) | undefined)?.(...args);
      },
    };
  }
}
