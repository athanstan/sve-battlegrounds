import type { CardClass } from '@sve/rules';
import type { Graphics } from 'pixi.js';

/**
 * One simple emblem per class, drawn as vector paths centred on the origin and fitting inside a
 * circle of radius `r`. They stand in for card art where a card has none, and fill leader
 * portraits. Each is a single silhouette: readable at thumbnail size, nothing to mistake for
 * set dressing.
 */

type Glyph = (g: Graphics, r: number, color: number) => void;

const sword: Glyph = (g, r, color) => {
  g.poly([
    0,
    -r,
    r * 0.17,
    -r * 0.62,
    r * 0.13,
    r * 0.34,
    -r * 0.13,
    r * 0.34,
    -r * 0.17,
    -r * 0.62,
  ]).fill(color);
  g.roundRect(-r * 0.46, r * 0.3, r * 0.92, r * 0.13, r * 0.05).fill(color);
  g.roundRect(-r * 0.07, r * 0.4, r * 0.14, r * 0.46, r * 0.04).fill(color);
  g.circle(0, r * 0.92, r * 0.1).fill(color);
};

const leaf: Glyph = (g, r, color) => {
  g.moveTo(0, r)
    .bezierCurveTo(r * 1.05, r * 0.3, r * 0.8, -r * 0.7, 0, -r)
    .bezierCurveTo(-r * 0.8, -r * 0.7, -r * 1.05, r * 0.3, 0, r)
    .closePath()
    .fill(color);
  g.moveTo(0, r * 0.82)
    .lineTo(0, -r * 0.5)
    .stroke({ width: r * 0.07, color: 0x000000, alpha: 0.35 });
  g.moveTo(0, r * 0.1)
    .lineTo(r * 0.32, -r * 0.14)
    .stroke({ width: r * 0.05, color: 0x000000, alpha: 0.3 });
  g.moveTo(0, r * 0.36)
    .lineTo(-r * 0.3, r * 0.1)
    .stroke({ width: r * 0.05, color: 0x000000, alpha: 0.3 });
};

const crystal: Glyph = (g, r, color) => {
  g.poly([
    0,
    -r,
    r * 0.62,
    -r * 0.1,
    r * 0.34,
    r * 0.82,
    -r * 0.34,
    r * 0.82,
    -r * 0.62,
    -r * 0.1,
  ]).fill(color);
  g.poly([0, -r, r * 0.16, -r * 0.1, 0, r * 0.82, -r * 0.16, -r * 0.1]).fill({
    color: 0x000000,
    alpha: 0.22,
  });
  g.moveTo(-r * 0.62, -r * 0.1)
    .lineTo(r * 0.62, -r * 0.1)
    .stroke({ width: r * 0.05, color: 0x000000, alpha: 0.3 });
};

const flame: Glyph = (g, r, color) => {
  g.moveTo(0, -r)
    .bezierCurveTo(r * 0.25, -r * 0.55, r * 0.85, -r * 0.2, r * 0.7, r * 0.35)
    .bezierCurveTo(r * 0.6, r * 0.85, r * 0.2, r, 0, r)
    .bezierCurveTo(-r * 0.3, r, -r * 0.8, r * 0.78, -r * 0.7, r * 0.2)
    .bezierCurveTo(-r * 0.62, -r * 0.1, -r * 0.35, -r * 0.2, -r * 0.3, -r * 0.5)
    .bezierCurveTo(-r * 0.2, -r * 0.7, -r * 0.05, -r * 0.8, 0, -r)
    .closePath()
    .fill(color);
  g.moveTo(0, r * 0.15)
    .bezierCurveTo(r * 0.3, r * 0.3, r * 0.3, r * 0.75, 0, r * 0.85)
    .bezierCurveTo(-r * 0.3, r * 0.75, -r * 0.3, r * 0.35, 0, r * 0.15)
    .closePath()
    .fill({ color: 0x000000, alpha: 0.25 });
};

const crescent: Glyph = (g, r, color) => {
  const points: number[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI * 0.72 + (i / steps) * Math.PI * 1.44;
    points.push(Math.cos(a) * r * 0.95 - r * 0.12, Math.sin(a) * r * 0.95);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -Math.PI * 0.6 + (i / steps) * Math.PI * 1.2;
    points.push(Math.cos(a) * r * 0.74 + r * 0.14, Math.sin(a) * r * 0.78);
  }
  g.poly(points).fill(color);
  g.circle(r * 0.5, -r * 0.45, r * 0.07).fill(color);
};

const star: Glyph = (g, r, color) => {
  g.star(0, 0, 8, r, r * 0.42, Math.PI / 8).fill(color);
  g.circle(0, 0, r * 0.2).fill({ color: 0x000000, alpha: 0.28 });
};

const ring: Glyph = (g, r, color) => {
  g.circle(0, 0, r * 0.8).stroke({ width: r * 0.16, color });
  g.circle(0, 0, r * 0.26).fill(color);
};

const GLYPHS: Readonly<Record<CardClass, Glyph>> = {
  swordcraft: sword,
  forestcraft: leaf,
  runecraft: crystal,
  dragoncraft: flame,
  abysscraft: crescent,
  havencraft: star,
  neutral: ring,
};

export function drawGlyph(g: Graphics, cardClass: CardClass, radius: number, color: number): void {
  GLYPHS[cardClass](g, radius, color);
}

/** A baked carrot for the race-zone badge (14.2). */
export function drawCarrot(g: Graphics, r: number, color: number): void {
  g.poly([0, r, r * 0.45, -r * 0.35, -r * 0.45, -r * 0.35]).fill(color);
  g.moveTo(-r * 0.18, -r * 0.35)
    .lineTo(-r * 0.05, -r * 0.85)
    .lineTo(r * 0.12, -r * 0.4)
    .lineTo(r * 0.22, -r * 0.9)
    .stroke({ width: r * 0.12, color: 0x5aa469, cap: 'round' });
}
