import type { CardCatalog, CardDefId, CardDefinition } from '@sve/rules';
import {
  Container,
  FillGradient,
  Graphics,
  Rectangle,
  Text,
  type Renderer,
  type Texture,
} from 'pixi.js';
import { CARD, CARD_TEXTURE_RESOLUTION, CLASS_STYLE, COLOR, FONTS } from '../theme';
import { bake } from './bake';
import { drawGlyph } from './glyphs';

/**
 * Card textures: the printed picture where there is one, and drawn stand-ins where there is not.
 *
 * A card on the table is a mesh with one of these textures, so a full board is a handful of draw
 * calls. The drawn face (name, cost, type line, text, stats) exists only for cards without a
 * picture; it is never put over one.
 */

const { width: W, height: H, radius: R } = CARD;

const gradient = (top: number, bottom: number): FillGradient =>
  new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
  });

function text(
  content: string,
  options: {
    font: 'display' | 'body';
    size: number;
    color: number;
    weight?: string;
    align?: 'left' | 'center';
    wrap?: number;
    line?: number;
  },
): Text {
  return new Text({
    text: content,
    resolution: CARD_TEXTURE_RESOLUTION,
    style: {
      fontFamily: FONTS[options.font],
      fontSize: options.size,
      fontWeight: (options.weight ?? '600') as '600',
      fill: options.color,
      align: options.align ?? 'left',
      wordWrap: options.wrap !== undefined,
      wordWrapWidth: options.wrap ?? 0,
      lineHeight: options.line ?? options.size * 1.2,
    },
  });
}

/** Squeeze a label horizontally until it fits, rather than letting it spill off the plate. */
function fit(label: Text, maxWidth: number): Text {
  if (label.width > maxWidth) label.scale.set(maxWidth / label.width, 1);
  return label;
}

const KIND_LABEL: Readonly<Record<CardDefinition['kind'], string>> = {
  leader: 'Leader',
  follower: 'Follower',
  spell: 'Spell',
  amulet: 'Amulet',
  equipment: 'Equipment',
  crest: 'Crest',
};

function typeLine(def: CardDefinition): string {
  const base =
    def.special === 'evolved'
      ? 'Evolved Follower'
      : def.special === 'token'
        ? 'Token'
        : KIND_LABEL[def.kind];
  return [base, ...def.traits].join(' \u00b7 ').toUpperCase();
}

function clip(content: string, max: number): string {
  return content.length <= max ? content : `${content.slice(0, max - 1).trimEnd()}\u2026`;
}

function costBadge(cost: number): Container {
  const badge = new Container();
  const ring = new Graphics();
  ring.circle(0, 0, 12.5).fill(gradient(COLOR.goldBright, COLOR.goldDeep));
  ring.circle(0, 0, 10).fill(COLOR.ink);
  const label = text(String(cost), {
    font: 'display',
    size: 14,
    color: COLOR.goldBright,
    weight: '700',
    align: 'center',
  });
  label.anchor.set(0.5);
  label.y = 0.5;
  badge.addChild(ring, label);
  return badge;
}

function statBadge(kind: 'attack' | 'defense', value: number): Container {
  const badge = new Container();
  const g = new Graphics();
  if (kind === 'attack') {
    // A faceted diamond: the blade-and-edge side of the card.
    g.poly([0, -14, 14, 0, 0, 14, -14, 0])
      .fill(gradient(0xf5b45c, 0x9a4a16))
      .stroke({ width: 1.4, color: 0x2a1406 });
  } else {
    // A heater shield: the guard side of the card.
    g.moveTo(-12, -12)
      .lineTo(12, -12)
      .lineTo(12, 3)
      .bezierCurveTo(12, 10, 5, 14, 0, 16)
      .bezierCurveTo(-5, 14, -12, 10, -12, 3)
      .closePath();
    g.fill(gradient(0x8fa9d8, 0x2c4272)).stroke({ width: 1.4, color: 0x0e1730 });
  }
  const label = text(String(value), {
    font: 'display',
    size: 15,
    color: 0xffffff,
    weight: '700',
    align: 'center',
  });
  label.anchor.set(0.5);
  label.y = kind === 'defense' ? 0.5 : 0;
  badge.addChild(g, label);
  return badge;
}

function artWindow(def: CardDefinition | undefined): Container {
  const style = CLASS_STYLE[def?.cardClass ?? 'neutral'];
  const x = 8;
  const y = 27;
  const w = W - 16;
  const h = 70;
  const group = new Container();

  const frame = new Graphics();
  frame.roundRect(x, y, w, h, 4).fill(gradient(style.main, style.dark));
  group.addChild(frame);

  // No picture to show: a soft glow and the class emblem, so the slot never reads as empty.
  const glow = new Graphics();
  glow.circle(x + w / 2, y + h / 2, 38).fill({ color: style.light, alpha: 0.18 });
  glow.circle(x + w / 2, y + h / 2, 24).fill({ color: style.light, alpha: 0.14 });
  const emblem = new Graphics();
  drawGlyph(emblem, def?.cardClass ?? 'neutral', 27, style.light);
  emblem.alpha = 0.78;
  emblem.position.set(x + w / 2, y + h / 2);
  group.addChild(glow, emblem);

  const rim = new Graphics();
  rim.roundRect(x, y, w, h, 4).stroke({ width: 1.2, color: COLOR.gold, alpha: 0.9 });
  group.addChild(rim);
  return group;
}

/** An empty card of the right class: what stands in while a card's picture is on its way. */
export function buildBlankFace(def: CardDefinition | undefined): Container {
  const style = CLASS_STYLE[def?.cardClass ?? 'neutral'];
  const face = new Container();
  const base = new Graphics();
  base.roundRect(0, 0, W, H, R).fill(gradient(style.dark, 0x0b0c0f));
  base
    .roundRect(3.5, 3.5, W - 7, H - 7, R - 3)
    .stroke({ width: 0.8, color: style.light, alpha: 0.22 });
  base.roundRect(0, 0, W, H, R).stroke({ width: 2.6, color: style.main, alignment: 1 });
  face.addChild(base);
  return face;
}

/**
 * A drawn card face, for a card that has no picture: name, cost, type line, text and stats.
 * A card with a picture never uses this - its face is the picture alone.
 */
export function buildCardFace(def: CardDefinition | undefined): Container {
  const style = CLASS_STYLE[def?.cardClass ?? 'neutral'];
  const face = new Container();

  const base = new Graphics();
  base.roundRect(0, 0, W, H, R).fill(gradient(style.dark, 0x0b0c0f));
  face.addChild(base);

  const inner = new Graphics();
  inner
    .roundRect(3.5, 3.5, W - 7, H - 7, R - 3)
    .stroke({ width: 0.8, color: style.light, alpha: 0.22 });
  face.addChild(inner);

  face.addChild(artWindow(def));

  const plate = new Graphics();
  plate
    .roundRect(8, 6, W - 16, 18, 4)
    .fill({ color: COLOR.ink, alpha: 0.88 })
    .stroke({ width: 1, color: style.main, alpha: 0.9 });
  face.addChild(plate);

  const name = fit(
    text(def?.name ?? '\u2026', {
      font: 'display',
      size: 10.5,
      color: COLOR.parchment,
      weight: '700',
    }),
    W - 52,
  );
  name.position.set(30, 15 - name.height / 2);
  face.addChild(name);

  if (def && def.kind !== 'leader') {
    const cost = costBadge(def.cost);
    cost.position.set(17, 15);
    face.addChild(cost);
  }

  const kind = fit(
    text(def ? typeLine(def) : '', { font: 'body', size: 6.4, color: style.light, weight: '600' }),
    W - 18,
  );
  kind.position.set(9, 100);
  face.addChild(kind);

  const box = new Graphics();
  box.roundRect(8, 110, W - 16, 38, 4).fill({ color: COLOR.ink, alpha: 0.74 });
  face.addChild(box);

  const body = text(clip(def?.text ?? '', 112), {
    font: 'body',
    size: 7.2,
    color: COLOR.parchment,
    weight: '500',
    wrap: W - 26,
    line: 8.8,
  });
  body.position.set(13, 113);
  face.addChild(body);

  if (def?.kind === 'follower') {
    if (def.attack !== null) {
      const attack = statBadge('attack', def.attack);
      attack.position.set(17, H - 15);
      face.addChild(attack);
    }
    if (def.defense !== null) {
      const defense = statBadge('defense', def.defense);
      defense.position.set(W - 17, H - 15);
      face.addChild(defense);
    }
  } else if (def) {
    const ribbon = text(KIND_LABEL[def.kind].toUpperCase(), {
      font: 'display',
      size: 9,
      color: style.main,
      weight: '700',
      align: 'center',
    });
    ribbon.anchor.set(0.5);
    ribbon.position.set(W / 2, H - 11);
    face.addChild(ribbon);
  }

  const border = new Graphics();
  const evolved = def?.special === 'evolved';
  border
    .roundRect(0, 0, W, H, R)
    .stroke({ width: evolved ? 3.4 : 2.6, color: evolved ? 0xb994ff : style.main, alignment: 1 });
  face.addChild(border);

  return face;
}

/** The back every hidden card shares: deep blue, gold lattice, a small crest. */
export function buildCardBack(): Container {
  const back = new Container();
  const base = new Graphics();
  base.roundRect(0, 0, W, H, R).fill(gradient(0x161d33, 0x090c16));
  back.addChild(base);

  const lattice = new Graphics();
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 1; i <= 9; i++) {
    const r = i * 11;
    lattice.poly([cx, cy - r * 1.4, cx + r, cy, cx, cy + r * 1.4, cx - r, cy]).stroke({
      width: i % 3 === 0 ? 1.1 : 0.7,
      color: COLOR.gold,
      alpha: i % 3 === 0 ? 0.55 : 0.28,
    });
  }
  const mask = new Graphics().roundRect(6, 6, W - 12, H - 12, R - 3).fill(0xffffff);
  lattice.mask = mask;
  back.addChild(lattice, mask);

  const crest = new Graphics();
  crest.circle(cx, cy, 17).fill(0x0a0d19).stroke({ width: 1.6, color: COLOR.gold });
  crest.star(cx, cy, 8, 12, 5.5, Math.PI / 8).fill(COLOR.gold);
  crest.circle(cx, cy, 3).fill(0x0a0d19);
  back.addChild(crest);

  const frame = new Graphics();
  frame.roundRect(0, 0, W, H, R).stroke({ width: 3, color: COLOR.gold, alignment: 1 });
  frame
    .roundRect(5, 5, W - 10, H - 10, R - 3)
    .stroke({ width: 0.8, color: COLOR.gold, alpha: 0.7 });
  back.addChild(frame);
  return back;
}

type FaceLook = 'picture' | 'blank' | 'drawn';

interface FaceEntry {
  readonly texture: Texture;
  readonly known: boolean;
  readonly look: FaceLook;
}

/**
 * Card textures. A card with a picture shows the picture and nothing else: its texture is the
 * image itself, used as loaded. While the picture is on its way the card is an empty plate of its
 * class, and a card that has no picture at all (or whose picture cannot be fetched) gets a drawn
 * face. Backs and drawn faces are baked once and cached.
 */
export class CardTextures {
  readonly #renderer: Renderer;
  #catalog: CardCatalog;
  #back: Texture | null = null;
  readonly #faces = new Map<CardDefId, FaceEntry>();
  /** Pictures by URL: `null` while loading. */
  readonly #pictures = new Map<string, Texture | null>();
  readonly #failed = new Set<string>();
  /** Cards waiting on a picture. Reprints share one, so one load can finish several cards. */
  readonly #waiting = new Map<string, Set<CardDefId>>();
  readonly #stale: Texture[] = [];
  readonly #loadArt: (url: string) => Promise<Texture | null>;

  constructor(
    renderer: Renderer,
    catalog: CardCatalog,
    loadArt: (url: string) => Promise<Texture | null>,
  ) {
    this.#renderer = renderer;
    this.#catalog = catalog;
    this.#loadArt = loadArt;
  }

  #bake(source: Container): Texture {
    return bake(this.#renderer, source, new Rectangle(0, 0, W, H), CARD_TEXTURE_RESOLUTION);
  }

  back(): Texture {
    this.#back ??= this.#bake(buildCardBack());
    return this.#back;
  }

  /**
   * The face for a definition. Returns immediately; if the definition or its picture is still on
   * its way, `onChange` is called with the id once a better texture is ready.
   */
  face(id: CardDefId, onChange: (id: CardDefId) => void): Texture {
    const def = this.#catalog(id);
    const url = def?.artUrl ?? null;
    const picture = url ? (this.#pictures.get(url) ?? null) : null;
    const pending = url !== null && !picture && !this.#failed.has(url);
    const look: FaceLook = picture ? 'picture' : !def || pending ? 'blank' : 'drawn';

    const cached = this.#faces.get(id);
    if (cached?.known === (def !== undefined) && cached.look === look) return cached.texture;

    const texture =
      picture ?? this.#bake(look === 'blank' ? buildBlankFace(def) : buildCardFace(def));
    // Sprites may still hold the old texture; it is released once the scene has swapped them.
    // Pictures are shared by every printing that uses them and are never released here.
    if (cached && cached.look !== 'picture') this.#stale.push(cached.texture);
    this.#faces.set(id, { texture, known: def !== undefined, look });

    if (url && pending) this.#fetch(url, id, onChange);
    return texture;
  }

  #fetch(url: string, id: CardDefId, onChange: (id: CardDefId) => void): void {
    const waiting = this.#waiting.get(url) ?? new Set<CardDefId>();
    waiting.add(id);
    this.#waiting.set(url, waiting);
    if (this.#pictures.has(url)) return;

    this.#pictures.set(url, null);
    void this.#loadArt(url).then((loaded) => {
      if (loaded) {
        // Cards are seen at a slant and small: mipmaps keep the picture clean when it shrinks.
        loaded.source.autoGenerateMipmaps = true;
        this.#pictures.set(url, loaded);
      } else {
        this.#pictures.delete(url);
        this.#failed.add(url);
      }
      const ids = this.#waiting.get(url);
      this.#waiting.delete(url);
      for (const waitingId of ids ?? []) onChange(waitingId);
    });
  }

  /** Swap in a new catalog (cards learned since); returns the ids whose faces need redrawing. */
  setCatalog(catalog: CardCatalog): CardDefId[] {
    this.#catalog = catalog;
    return [...this.#faces]
      .filter(([id, entry]) => !entry.known && catalog(id) !== undefined)
      .map(([id]) => id);
  }

  /** Release textures replaced by a redraw. Call after every sprite has been given its new face. */
  flushStale(): void {
    for (const texture of this.#stale.splice(0)) texture.destroy(true);
  }

  destroy(): void {
    this.flushStale();
    this.#back?.destroy(true);
    for (const { texture, look } of this.#faces.values()) {
      if (look !== 'picture') texture.destroy(true);
    }
    this.#faces.clear();
    this.#pictures.clear();
    this.#waiting.clear();
  }
}
