import { Container, FillGradient, Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { CARD, COLOR, LEADER_CARD } from '../theme';
import { bake } from './bake';
import { drawCarrot } from './glyphs';

/**
 * The small, reusable pieces of the board's furniture: orbs, the defense shield, and the soft
 * glows and shadows that give cards weight. Each is vector art baked once.
 */

const { width: W, height: H, radius: R } = CARD;
const PAD = 26;

const radial = (inner: number, outer: number, size: number, offset = 0): FillGradient =>
  new FillGradient({
    type: 'radial',
    center: { x: 0.5 - offset, y: 0.5 - offset },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5 * size,
    colorStops: [
      { offset: 0, color: inner },
      { offset: 1, color: outer },
    ],
  });

const vertical = (top: number, bottom: number): FillGradient =>
  new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
  });

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
}

export interface HudTextures {
  readonly orbLit: (color: number) => Texture;
  readonly orbDim: (color: number) => Texture;
  readonly shield: Texture;
  readonly shadow: Texture;
  readonly glow: (color: number) => Texture;
  /** Gold halo around a leader card: whose turn, or who the match is waiting on. */
  readonly leaderHalo: Texture;
  readonly carrot: Texture;
  destroy(): void;
}

export const ORB_SIZE = 20;
const ORB_FRAME = 26;
export const SHIELD_SIZE = { width: 50, height: 60 } as const;

export function createHudTextures(renderer: Renderer): HudTextures {
  const owned: Texture[] = [];
  const keep = (texture: Texture): Texture => {
    owned.push(texture);
    return texture;
  };
  const memo = <K, V>(make: (key: K) => V): ((key: K) => V) => {
    const cache = new Map<K, V>();
    return (key) => {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const made = make(key);
      cache.set(key, made);
      return made;
    };
  };

  const orbFrame = new Rectangle(-ORB_FRAME / 2, -ORB_FRAME / 2, ORB_FRAME, ORB_FRAME);

  const orbLit = memo((color: number) => {
    const root = new Container();
    const g = new Graphics();
    g.circle(0, 0, ORB_SIZE / 2 + 2).fill({ color, alpha: 0.22 });
    g.circle(0, 0, ORB_SIZE / 2).fill(
      radial(shade(color, 1.55), shade(color, 0.55), ORB_SIZE, 0.16),
    );
    g.circle(0, 0, ORB_SIZE / 2).stroke({ width: 1.1, color: shade(color, 0.4) });
    g.ellipse(-2.6, -3.2, 3.6, 2.4).fill({ color: 0xffffff, alpha: 0.55 });
    root.addChild(g);
    return keep(bake(renderer, root, orbFrame, 3));
  });

  const orbDim = memo((color: number) => {
    const root = new Container();
    const g = new Graphics();
    g.circle(0, 0, ORB_SIZE / 2).fill(radial(0x1c1e24, 0x0b0c0f, ORB_SIZE));
    g.circle(0, 0, ORB_SIZE / 2).stroke({ width: 1.4, color: shade(color, 0.9), alpha: 0.85 });
    g.circle(0, 0, 2.4).fill({ color, alpha: 0.4 });
    root.addChild(g);
    return keep(bake(renderer, root, orbFrame, 3));
  });

  const shield = (() => {
    const { width: sw, height: sh } = SHIELD_SIZE;
    const root = new Container();
    const path = (g: Graphics, inset: number) => {
      const w = sw / 2 - inset;
      const top = -sh / 2 + inset;
      g.moveTo(-w, top)
        .lineTo(w, top)
        .lineTo(w, sh * 0.1)
        .bezierCurveTo(w, sh * 0.32, w * 0.4, sh * 0.44, 0, sh / 2 - inset)
        .bezierCurveTo(-w * 0.4, sh * 0.44, -w, sh * 0.32, -w, sh * 0.1)
        .closePath();
    };
    const g = new Graphics();
    path(g, 0);
    g.fill(vertical(COLOR.goldBright, COLOR.goldDeep));
    path(g, 3.2);
    g.fill(vertical(0x353e52, 0x151922));
    path(g, 6);
    g.stroke({ width: 0.8, color: COLOR.gold, alpha: 0.5 });
    root.addChild(g);
    return keep(bake(renderer, root, new Rectangle(-sw / 2 - 6, -sh / 2 - 6, sw + 12, sh + 12), 3));
  })();

  const shadow = (() => {
    const root = new Container();
    const g = new Graphics();
    for (let i = 0; i < 11; i++) {
      const grow = i * 1.7;
      g.roundRect(-grow, -grow, W + grow * 2, H + grow * 2, R + grow).fill({
        color: 0x000000,
        alpha: 0.055,
      });
    }
    root.addChild(g);
    return keep(bake(renderer, root, new Rectangle(-PAD, -PAD, W + PAD * 2, H + PAD * 2), 1));
  })();

  const glow = memo((color: number) => {
    const root = new Container();
    const g = new Graphics();
    for (let i = 8; i >= 0; i--) {
      const grow = 1 + i * 2.2;
      g.roundRect(-grow / 2, -grow / 2, W + grow, H + grow, R + grow / 2).stroke({
        width: 2.4,
        color,
        alpha: 0.62 - i * 0.06,
      });
    }
    root.addChild(g);
    return keep(bake(renderer, root, new Rectangle(-PAD, -PAD, W + PAD * 2, H + PAD * 2), 2));
  });

  const leaderHalo = (() => {
    const { width: lw, height: lh } = LEADER_CARD;
    const pad = 32;
    const root = new Container();
    const g = new Graphics();
    for (let i = 0; i < 10; i++) {
      const grow = 5 + i * 2.4;
      g.roundRect(
        -lw / 2 - grow,
        -lh / 2 - grow,
        lw + grow * 2,
        lh + grow * 2,
        12 + grow / 2,
      ).stroke({
        width: 2.6,
        color: COLOR.goldBright,
        alpha: 0.55 - i * 0.045,
      });
    }
    root.addChild(g);
    return keep(
      bake(
        renderer,
        root,
        new Rectangle(-lw / 2 - pad, -lh / 2 - pad, lw + pad * 2, lh + pad * 2),
        2,
      ),
    );
  })();

  const carrot = (() => {
    const root = new Container();
    const g = new Graphics();
    g.circle(0, 0, 11).fill({ color: COLOR.ink, alpha: 0.78 });
    drawCarrot(g, 8, COLOR.carrot);
    root.addChild(g);
    return keep(bake(renderer, root, new Rectangle(-14, -14, 28, 28), 3));
  })();

  return {
    orbLit,
    orbDim,
    shield,
    shadow,
    glow,
    leaderHalo,
    carrot,
    destroy() {
      for (const texture of owned.splice(0)) texture.destroy(true);
    },
  };
}
