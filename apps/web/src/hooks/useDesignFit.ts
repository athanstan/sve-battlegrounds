import { DESIGN } from '@sve/playmat';
import { useLayoutEffect, useState, type RefObject } from 'react';

export interface DesignFit {
  /** CSS pixels per design pixel. */
  readonly scale: number;
  /** Where the design area's top-left corner sits inside the host, in CSS pixels. */
  readonly left: number;
  readonly top: number;
}

/**
 * Where the playmat's design area (the part with the cards) lands inside its host element. The
 * chrome positions itself against the same box the canvas fits, so a name plate stays beside
 * its leader at any window size.
 */
export function useDesignFit(host: RefObject<HTMLElement | null>): DesignFit {
  const [fit, setFit] = useState<DesignFit>({ scale: 1, left: 0, top: 0 });

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const scale = Math.min(width / DESIGN.width, height / DESIGN.height);
      setFit({
        scale,
        left: (width - DESIGN.width * scale) / 2,
        top: (height - DESIGN.height * scale) / 2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);

  return fit;
}

/** CSS position for a point given in design pixels. */
export const placeAt = (fit: DesignFit, x: number, y: number) => ({
  left: fit.left + x * fit.scale,
  top: fit.top + y * fit.scale,
});
