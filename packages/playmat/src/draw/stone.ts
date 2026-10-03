import { Texture } from 'pixi.js';

/**
 * Procedural dark stone and the vignette that frames it.
 *
 * Drawn once on a 2D canvas: broad mottling and faint veining at low resolution (stretched up
 * smoothly), plus a fine grain tile on top. Deterministic from a seed, so the mat looks the same
 * on every machine and in every screenshot.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise: a lattice of random values, interpolated with a smoothstep. */
function valueNoise(
  width: number,
  height: number,
  cell: number,
  random: () => number,
): Float32Array {
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const lattice = Float32Array.from({ length: gw * gh }, random);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const sx = fx * fx * (3 - 2 * fx);
      const i = y0 * gw + x0;
      const top = (lattice[i] ?? 0) + ((lattice[i + 1] ?? 0) - (lattice[i] ?? 0)) * sx;
      const bottom =
        (lattice[i + gw] ?? 0) + ((lattice[i + gw + 1] ?? 0) - (lattice[i + gw] ?? 0)) * sx;
      out[y * width + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

function canvasOf(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');
  return { canvas, ctx };
}

export interface StoneOptions {
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
}

export function createStoneTexture({ width, height, seed = 7 }: StoneOptions): Texture {
  const random = mulberry32(seed);
  const { canvas, ctx } = canvasOf(width, height);

  // Broad structure, computed at a quarter of the size and stretched up smoothly.
  const lw = Math.ceil(width / 4);
  const lh = Math.ceil(height / 4);
  const low = canvasOf(lw, lh);
  const image = low.ctx.createImageData(lw, lh);
  const mottle = valueNoise(lw, lh, 70, random);
  const patches = valueNoise(lw, lh, 22, random);
  const drift = valueNoise(lw, lh, 120, random);
  const vein = valueNoise(lw, lh, 38, random);
  for (let i = 0; i < lw * lh; i++) {
    const m = (mottle[i] ?? 0.5) - 0.5;
    const p = (patches[i] ?? 0.5) - 0.5;
    const d = (drift[i] ?? 0.5) - 0.5;
    // Veins: thin dark lines where a slow noise crosses its midpoint.
    const crack = Math.max(0, 1 - Math.abs((vein[i] ?? 0.5) - 0.5) / 0.012);
    const tone = 33 + m * 16 + p * 7 + d * 6 - crack * 7;
    image.data[i * 4] = tone - d * 2;
    image.data[i * 4 + 1] = tone + 1.5;
    image.data[i * 4 + 2] = tone + 6 + d * 3;
    image.data[i * 4 + 3] = 255;
  }
  low.ctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(low.canvas, 0, 0, width, height);

  // Fine grain: a small tile of speckle, repeated.
  const tile = canvasOf(128, 128);
  const speckle = tile.ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 128 + (random() - 0.5) * 120;
    speckle.data[i * 4] = v;
    speckle.data[i * 4 + 1] = v;
    speckle.data[i * 4 + 2] = v;
    speckle.data[i * 4 + 3] = 255;
  }
  tile.ctx.putImageData(speckle, 0, 0);
  const pattern = ctx.createPattern(tile.canvas, 'repeat');
  if (pattern) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return Texture.from(canvas);
}

/** A screen-sized darkening toward the edges, so the mat has no visible limit. */
export function createVignetteTexture(): Texture {
  const { canvas, ctx } = canvasOf(512, 288);
  const gradient = ctx.createRadialGradient(256, 144, 60, 256, 144, 330);
  gradient.addColorStop(0, 'rgba(6, 7, 10, 0)');
  gradient.addColorStop(0.55, 'rgba(6, 7, 10, 0.1)');
  gradient.addColorStop(1, 'rgba(6, 7, 10, 0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 288);
  return Texture.from(canvas);
}
