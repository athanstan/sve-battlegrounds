import { Container, Graphics, PerspectiveMesh, type Texture } from 'pixi.js';
import type { Camera } from '../camera';
import { createStoneTexture } from '../draw/stone';

/**
 * The mat itself: dark stone, one faint circle at the centre, one thin line across the middle.
 *
 * Nothing else. An empty zone is empty mat, so there are no slots, rings or ornaments here - only
 * the two marks that say where the table's middle is. All of it lies on the table plane and is
 * seen through the same camera as the cards, so the perspective agrees everywhere.
 */

/** The stretch of table the stone covers, in table units. Wide and deep enough to bleed past any canvas. */
const TABLE = { left: -1800, right: 1800, far: -1400, near: 800 } as const;
/** Stone texels per table unit. Enough that the grain is not visibly magnified at the near edge. */
const TEXELS_PER_UNIT = 0.75;

const CIRCLE_RADIUS = 280;
const CIRCLE_SEGMENTS = 120;
const MARK_COLOR = 0x8a93a3;

export class Floor extends Container {
  readonly #texture: Texture;
  readonly #mesh: PerspectiveMesh;
  readonly #marks = new Graphics();

  constructor(camera: Camera) {
    super();
    this.#texture = createStoneTexture({
      width: Math.round((TABLE.right - TABLE.left) * TEXELS_PER_UNIT),
      height: Math.round((TABLE.near - TABLE.far) * TEXELS_PER_UNIT),
    });
    // Mipmaps keep the grain from shimmering where the far part of the table is minified.
    this.#texture.source.autoGenerateMipmaps = true;
    this.#mesh = new PerspectiveMesh({ texture: this.#texture, verticesX: 24, verticesY: 24 });
    this.addChild(this.#mesh, this.#marks);
    this.setCamera(camera);
  }

  /** Re-seat the floor for a different camera. */
  setCamera(camera: Camera): void {
    const tl = camera.project(TABLE.left, TABLE.far);
    const tr = camera.project(TABLE.right, TABLE.far);
    const br = camera.project(TABLE.right, TABLE.near);
    const bl = camera.project(TABLE.left, TABLE.near);
    this.#mesh.setCorners(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);

    const ring = Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
      const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      const p = camera.project(Math.cos(angle) * CIRCLE_RADIUS, Math.sin(angle) * CIRCLE_RADIUS);
      return [p.x, p.y] as const;
    }).flat();
    const left = camera.project(TABLE.left, 0);
    const right = camera.project(TABLE.right, 0);

    // Each mark is a faint wide stroke under a thin brighter one: pressed into the stone.
    this.#marks.clear();
    for (const [width, alpha] of [
      [6, 0.05],
      [1.6, 0.3],
    ] as const) {
      this.#marks.poly(ring, true).stroke({ width, color: MARK_COLOR, alpha, join: 'round' });
      this.#marks
        .moveTo(left.x, left.y)
        .lineTo(right.x, right.y)
        .stroke({ width, color: MARK_COLOR, alpha: alpha * 0.7 });
    }
  }

  override destroy(): void {
    super.destroy({ children: true });
    this.#texture.destroy(true);
  }
}
