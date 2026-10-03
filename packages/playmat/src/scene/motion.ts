import gsap from 'gsap';

/**
 * Every animation on the mat goes through here, so there is one switch for them all.
 *
 * With motion off (the viewer prefers reduced motion, or a snapshot is being laid down) a move
 * lands instantly: the board ends up in exactly the same place, only the journey is skipped.
 * Decorative flourishes - pulses, shakes - simply do not play.
 */
export class Motion {
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** Move `target` to `vars`, or put it there outright when motion is off or `instant`. */
  to<T extends object>(target: T, vars: gsap.TweenVars, instant = false): void {
    if (!this.enabled || instant) {
      const { duration: _d, delay: _w, ease: _e, onComplete, ...values } = vars;
      gsap.killTweensOf(target);
      Object.assign(target, values);
      onComplete?.();
      return;
    }
    gsap.to(target, { overwrite: 'auto', duration: 0.4, ease: 'power2.out', ...vars });
  }

  /** A flourish: jump to `from`, then settle to `to`. Skipped when motion is off. */
  burst<T extends object>(target: T, from: gsap.TweenVars, to: gsap.TweenVars): void {
    if (!this.enabled) return;
    gsap.fromTo(target, from, { overwrite: 'auto', ease: 'power2.out', ...to });
  }

  /** A flourish in several steps. Skipped when motion is off. */
  steps<T extends object>(target: T, steps: gsap.TweenVars[]): void {
    if (!this.enabled) return;
    gsap.to(target, { overwrite: 'auto', keyframes: steps });
  }

  kill(target: object): void {
    gsap.killTweensOf(target);
  }
}
