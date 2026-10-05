import type { CardCatalog, CardDefId } from '@sve/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCamera, DEFAULT_CAMERA } from '../camera';
import type { CardSlot } from '../layout';
import { DESIGN } from '../theme';
import { CardActor, type Art } from './actors';

/** What the actor asked Pixi to do. Rebuilding a mesh, a chip or a label is what costs a frame. */
const spent = vi.hoisted(() => ({ corners: 0, clears: 0, textWrites: 0, fillWrites: 0 }));

vi.mock('pixi.js', () => {
  class Point {
    x = 0;
    y = 0;
    set(x: number, y = x): void {
      this.x = x;
      this.y = y;
    }
  }
  class Node {
    children: Node[] = [];
    position = new Point();
    scale = new Point();
    alpha = 1;
    visible = true;
    zIndex = 0;
    eventMode = 'auto';
    cursor = '';
    hitArea: unknown;
    sortableChildren = false;
    rotation = 0;
    tint = 0xffffff;
    texture: unknown;
    constructor(options: { texture?: unknown } = {}) {
      this.texture = options.texture;
    }
    addChild(...children: Node[]): void {
      this.children.push(...children);
    }
    on(): this {
      return this;
    }
  }
  class Container extends Node {}
  class Sprite extends Node {}
  class Graphics extends Node {
    clear(): this {
      spent.clears++;
      return this;
    }
    roundRect(): this {
      return this;
    }
    fill(): this {
      return this;
    }
  }
  class Text extends Node {
    #text: string;
    readonly style = {
      _fill: 0,
      get fill(): number {
        return this._fill;
      },
      set fill(value: number) {
        spent.fillWrites++;
        this._fill = value;
      },
    };
    constructor(options: { text?: string }) {
      super();
      this.#text = options.text ?? '';
    }
    get text(): string {
      return this.#text;
    }
    set text(value: string) {
      spent.textWrites++;
      this.#text = value;
    }
    get width(): number {
      return this.#text.length * 8 * this.scale.x;
    }
    get height(): number {
      return 16 * this.scale.y;
    }
  }
  class PerspectiveMesh extends Node {
    setCorners(): void {
      spent.corners++;
    }
  }
  return { Container, Sprite, Graphics, Text, PerspectiveMesh };
});

const camera = createCamera({ ...DEFAULT_CAMERA, viewport: DESIGN });

const art = (overrides: { camera?: () => typeof camera; catalog?: () => CardCatalog } = {}): Art =>
  ({
    textures: { back: () => 'back', face: () => 'face' },
    hud: { shadow: 'shadow', carrot: 'carrot', glow: (color: number) => `glow:${color}` },
    catalog: overrides.catalog ?? (() => () => undefined),
    camera: overrides.camera ?? (() => camera),
    onFaceChange: () => undefined,
  }) as unknown as Art;

const slot = (extra: Partial<CardSlot> = {}): CardSlot =>
  ({
    key: 'card:1',
    seat: 'player1',
    zone: 'field',
    ref: { id: 'c1', def: 'DEF' as CardDefId },
    pose: { x: 700, y: 500, scale: 1, rotation: 0 },
    z: 1,
    flat: 1,
    index: 0,
    engaged: false,
    evolved: null,
    shown: { attack: 3, defense: 4, keywords: [] },
    racedTimes: 0,
    counters: {},
    ...extra,
  }) as unknown as CardSlot;

/** A face-up card that has finished its flip, so the stat chips are showing. */
const faceUp = (extra: Partial<CardSlot> = {}, deps: Art = art()): CardActor => {
  const actor = new CardActor(slot(extra), deps);
  actor.pose.flip = 1;
  actor.sync();
  return actor;
};

const reset = (): void => {
  spent.corners = 0;
  spent.clears = 0;
  spent.textWrites = 0;
  spent.fillWrites = 0;
};

describe('CardActor.sync', () => {
  beforeEach(reset);

  it('rebuilds nothing for a card that is sitting still', () => {
    const actor = faceUp();
    reset();

    for (let frame = 0; frame < 10; frame++) actor.sync(frame * 16);

    expect(spent).toEqual({ corners: 0, clears: 0, textWrites: 0, fillWrites: 0 });
  });

  it('moves a card that moves, and leaves its stat chips alone while the numbers are the same', () => {
    const actor = faceUp();
    reset();

    actor.pose.x += 40;
    actor.sync();

    // Body and shadow are laid out again (the rim and glow are off) ...
    expect(spent.corners).toBe(2);
    // ... but the chips are neither redrawn nor re-rasterised.
    expect(spent.clears).toBe(0);
    expect(spent.textWrites).toBe(0);
    expect(spent.fillWrites).toBe(0);
  });

  it('keeps a sitting card still while another card moves', () => {
    const moving = faceUp();
    const sitting = faceUp({ key: 'card:2' });
    reset();

    moving.pose.y -= 10;
    moving.sync();
    const forMoving = spent.corners;
    sitting.sync();

    expect(forMoving).toBeGreaterThan(0);
    expect(spent.corners).toBe(forMoving);
  });

  it('redraws a chip when its number changes, and only that chip', () => {
    const actor = faceUp();
    reset();

    actor.place(slot({ shown: { attack: 5, defense: 4, keywords: [] } }));
    actor.sync();

    expect(spent.clears).toBe(1);
    expect(spent.textWrites).toBe(1);
    expect(spent.corners).toBe(0);
  });

  it('draws both chips and both numbers the first time they show', () => {
    new CardActor(slot({ ref: null }), art()); // a back: nothing to show
    expect(spent.clears).toBe(0);

    faceUp();

    expect(spent.clears).toBe(2);
    expect(spent.textWrites).toBe(2);
    expect(spent.corners).toBeGreaterThanOrEqual(2);
  });

  it('does not rewrite the colour of a buffed number every frame', () => {
    const catalog: CardCatalog = () =>
      ({ attack: 2, defense: 4, scripted: true, text: '' }) as unknown as ReturnType<CardCatalog>;
    const actor = faceUp({}, art({ catalog: () => catalog }));
    reset();

    actor.sync();

    expect(spent.fillWrites).toBe(0);
  });

  it('lays the meshes out again for a new camera', () => {
    let current = camera;
    const actor = faceUp({}, art({ camera: () => current }));
    reset();

    current = createCamera({ ...DEFAULT_CAMERA, viewport: DESIGN, pitch: 30 });
    actor.sync();

    expect(spent.corners).toBeGreaterThan(0);
  });

  it('lays out the glow of a newly highlighted card even though it did not move', () => {
    const actor = faceUp();
    reset();

    actor.setHighlight('legal');
    actor.sync(0);

    expect(spent.corners).toBe(3);
  });

  it('pulses a legal glow without rebuilding it, and holds a selected one steady', () => {
    const actor = faceUp();
    actor.setHighlight('legal');
    actor.sync(0);
    reset();

    for (let frame = 1; frame < 8; frame++) actor.sync(frame * 40);
    expect(spent.corners).toBe(0);

    actor.setHighlight('selected');
    actor.sync(500);
    reset();
    actor.sync(540);
    expect(spent.corners).toBe(0);
  });
});
