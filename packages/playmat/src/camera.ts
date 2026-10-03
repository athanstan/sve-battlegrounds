import { OVERLAY } from './theme';

/**
 * The playmat's fixed camera.
 *
 * The table is a plane. Positions on it are in *table units* (one unit is one design pixel at
 * the centre of the table): `x` runs left to right, `y` runs from the far edge (negative) to the
 * near edge (positive, the local seat). Everything that sits on the table - the stone floor, the
 * centre circle, the field and EX rows - is placed there and then projected, so the
 * whole board shares one perspective instead of each row being scaled by hand.
 *
 * The camera looks at the table's centre from above and in front, pitched down. With the view
 * axis through the origin the projection has a closed form:
 *
 *     depth  = D - y * cos(pitch)
 *     scale  = D / depth
 *     screen = ( cx + x * scale,  cy + y * sin(pitch) * scale )
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A table-plane point seen through the camera. */
export interface Projected {
  readonly x: number;
  readonly y: number;
  /** How large something that is one table unit wide appears. 1 at the centre of the table. */
  readonly scale: number;
}

export interface CameraOptions {
  /** The design-space viewport the camera frames. */
  readonly viewport: Size;
  /** Degrees the camera is pitched down from the horizon: 90 is straight overhead. */
  readonly pitch: number;
  /** Camera-to-table-centre distance in table units. Smaller means stronger perspective. */
  readonly distance: number;
  /** Screen y that the table's centre line lands on. */
  readonly centreY: number;
}

/** A screen point traced back onto the table plane. */
export interface Grounded {
  /** Table units. */
  readonly x: number;
  readonly y: number;
  /** The `scale` the camera gives at that spot. */
  readonly scale: number;
}

export interface Camera {
  readonly options: CameraOptions;
  /** Where a point of the table plane appears. Throws for points behind the camera. */
  project(x: number, y: number): Projected;
  /** Like `project`, but `null` for a point behind the camera instead of throwing. */
  tryProject(x: number, y: number): Projected | null;
  /** The table point that appears at a screen point; `null` above the horizon. */
  unproject(x: number, y: number): Grounded | null;
}

/**
 * A table seen from the player's end, the way you look at one across a room: pitched well
 * below overhead, with enough perspective that the far side is visibly smaller.
 */
export const DEFAULT_CAMERA: Omit<CameraOptions, 'viewport'> = {
  pitch: 46,
  distance: 1250,
  centreY: OVERLAY.midlineY,
};

export function createCamera(options: CameraOptions): Camera {
  const pitchRadians = (options.pitch * Math.PI) / 180;
  const cos = Math.cos(pitchRadians);
  const sin = Math.sin(pitchRadians);
  const cx = options.viewport.width / 2;
  const { distance, centreY } = options;

  if (distance <= 0) throw new RangeError('Camera distance must be positive');

  const tryProject = (x: number, y: number): Projected | null => {
    const depth = distance - y * cos;
    if (depth <= 0) return null;
    const scale = distance / depth;
    return { x: cx + x * scale, y: centreY + y * sin * scale, scale };
  };

  return {
    options,
    tryProject,
    project(x, y) {
      const projected = tryProject(x, y);
      if (!projected) throw new RangeError(`Table point (${x}, ${y}) is behind the camera`);
      return projected;
    },
    unproject(x, y) {
      // Invert `screenY = centreY + y * sin * D / (D - y * cos)` for y.
      const up = y - centreY;
      const denominator = distance * sin + up * cos;
      if (denominator <= 1e-6) return null;
      const tableY = (up * distance) / denominator;
      const scale = distance / (distance - tableY * cos);
      return { x: (x - cx) / scale, y: tableY, scale };
    },
  };
}
