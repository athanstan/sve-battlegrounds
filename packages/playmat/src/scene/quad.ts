import { PerspectiveMesh, type Texture } from 'pixi.js';
import type { Camera } from '../camera';

/**
 * Putting a card on the table.
 *
 * A card is a texture stretched over four corners. When it faces the player the corners are a
 * plain rectangle; when it lies on the table they are the rectangle's corners *on the table
 * plane*, run through the same camera as the floor, so a flat card is foreshortened exactly as
 * the stone beneath it is. `flat` blends between the two, which is how a hovered card stands up
 * to be read and how a held hand leans back a little.
 */

/** Top-left, top-right, bottom-right, bottom-left: x, y for each. */
export type Corners = readonly [number, number, number, number, number, number, number, number];

export interface QuadPose {
  /** Screen position of the card's centre, in design space. */
  readonly x: number;
  readonly y: number;
  /** Size relative to a card at the centre of the table. */
  readonly scale: number;
  /** Radians, clockwise: in the screen when upright, on the table when flat. */
  readonly rotation: number;
  /** 0 faces the player, 1 lies on the table. */
  readonly flat: number;
  /** 1 is face-on; a flip squeezes this through 0 (edge-on). */
  readonly width: number;
}

const LOCAL = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

const rotate = (x: number, y: number, angle: number): readonly [number, number] => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
};

/** Corners of a rectangle `halfWidth` x `halfHeight` (card units) around the pose's centre. */
export function cornersOf(
  camera: Camera,
  pose: QuadPose,
  halfWidth: number,
  halfHeight: number,
): Corners {
  const upright = LOCAL.flatMap(([cx, cy]) => {
    const [dx, dy] = rotate(
      cx * halfWidth * pose.width * pose.scale,
      cy * halfHeight * pose.scale,
      pose.rotation,
    );
    return [pose.x + dx, pose.y + dy];
  });

  const flat = lie(camera, pose, halfWidth, halfHeight);
  if (!flat || pose.flat <= 0) return upright as unknown as Corners;
  return upright.map(
    (value, index) => value + ((flat[index] ?? value) - value) * pose.flat,
  ) as unknown as Corners;
}

/** The same rectangle lying on the table under the pose's centre, or `null` where there is none. */
function lie(
  camera: Camera,
  pose: QuadPose,
  halfWidth: number,
  halfHeight: number,
): number[] | null {
  if (pose.flat <= 0) return null;
  const ground = camera.unproject(pose.x, pose.y);
  if (!ground) return null;
  // The card keeps the size it was given: how many table units wide it is follows from how wide
  // it was asked to look where it stands.
  const size = pose.scale / ground.scale;

  const out: number[] = [];
  for (const [cx, cy] of LOCAL) {
    const [dx, dy] = rotate(
      cx * halfWidth * pose.width * size,
      cy * halfHeight * size,
      pose.rotation,
    );
    const seen = camera.tryProject(ground.x + dx, ground.y + dy);
    if (!seen) return null;
    out.push(seen.x, seen.y);
  }
  return out;
}

/** Is `(x, y)` inside the convex quad? Used for picking, so the click lands where the card looks. */
export function insideQuad(corners: Corners, x: number, y: number): boolean {
  let side = 0;
  for (let i = 0; i < 4; i++) {
    const ax = corners[i * 2] ?? 0;
    const ay = corners[i * 2 + 1] ?? 0;
    const bx = corners[((i + 1) % 4) * 2] ?? 0;
    const by = corners[((i + 1) % 4) * 2 + 1] ?? 0;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    if (side === 0) side = Math.sign(cross);
    else if (Math.sign(cross) !== side) return false;
  }
  return true;
}

/** A texture drawn over four free corners, with perspective-correct mapping. */
export class QuadMesh extends PerspectiveMesh {
  constructor(texture: Texture) {
    // The quads are small and nearly planar, so a coarse grid is already exact to the eye.
    super({ texture, verticesX: 6, verticesY: 6 });
  }

  setQuad(c: Corners): void {
    this.setCorners(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]);
  }
}
