import type { CardCatalog, CardDefId, Keyword } from '@sve/rules';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Camera } from '../camera';
import type { CardTextures } from '../draw/cards';
import { ORB_SIZE, type HudTextures } from '../draw/hud';
import type { AvatarSlot, CardSlot, OrbTraySlot, PileSlot, Zone } from '../layout';
import { CARD, COLOR, DESIGN, FONTS, LEADER_CARD } from '../theme';
import { QuadMesh, cornersOf, insideQuad, type Corners } from './quad';

/**
 * The things on the board: a card, a pile, a leader, a tray of orbs.
 *
 * Actors are dumb. They hold animatable numbers and know how to draw themselves from them;
 * deciding where they go and when is the board's job.
 */

export interface Art {
  readonly textures: CardTextures;
  readonly hud: HudTextures;
  readonly catalog: () => CardCatalog;
  /** The current camera: table cards are laid onto the plane it looks at. */
  readonly camera: () => Camera;
  readonly onFaceChange: (id: CardDefId) => void;
}

// ---------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------

/** What the viewer is being asked to do with a card. */
export type Highlight = 'none' | 'legal' | 'selected';

/** The numbers a tween moves. */
export interface CardPose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** 0 shows the back, 1 the face. A flip passes through 0.5, edge-on. */
  flip: number;
  /** Pointer hover, 0 to 1. */
  lift: number;
  /** Chosen for a prompt, 0 to 1. */
  pick: number;
  alpha: number;
}

/** How much a hovered card grows and rises, by where it sits. Cards that sit small grow most. */
const HOVER: Readonly<Record<Zone, { zoom: number; rise: number }>> = {
  hand: { zoom: 0.55, rise: 92 },
  field: { zoom: 0.75, rise: 0 },
  ex: { zoom: 1.1, rise: 0 },
  cemetery: { zoom: 0.9, rise: 0 },
  banished: { zoom: 1.1, rise: 0 },
  resolution: { zoom: 0.2, rise: 0 },
};

const HOVER_Z = 200;
const EVOLVED_RIM = 0xb48cff;
/** How far, in card pixels, the baked shadow and glow textures extend past the card. */
const HALO = 26;
const SHADOW_DROP = 7;
const HALF = { width: CARD.width / 2, height: CARD.height / 2 } as const;

const KEY_MARK: Partial<Record<Keyword, string>> = {
  ward: 'W',
  storm: 'St',
  rush: 'R',
  assail: 'A',
  intimidate: 'I',
  drain: 'D',
  bane: 'B',
  aura: 'Au',
  quick: 'Q',
};

const PLATE = {
  fontFamily: FONTS.display,
  fontSize: 15,
  fontWeight: '700',
  fill: 0xffffff,
  stroke: { color: COLOR.ink, width: 3 },
} as const;

export class CardActor extends Container {
  readonly pose: CardPose;
  slot: CardSlot;
  readonly #art: Art;
  readonly #shadow: QuadMesh;
  readonly #glow: QuadMesh;
  readonly #rim: QuadMesh;
  readonly #body: QuadMesh;
  /** Where the card is on screen right now, for picking. */
  #corners: Corners = [0, 0, 0, 0, 0, 0, 0, 0];
  #face: Texture | null = null;
  #highlight: Highlight = 'none';
  #hovered = false;
  readonly #atk: Text;
  readonly #def: Text;
  readonly #keys: Text;
  readonly #carrot: Sprite;
  readonly #carrotCount: Text;
  readonly #badge: Text;
  /** Animated 0..1 when a carrot appears. */
  readonly carrotHop = { amount: 0 };

  constructor(slot: CardSlot, art: Art) {
    super();
    this.slot = slot;
    this.#art = art;
    this.pose = { ...slot.pose, flip: slot.ref ? 1 : 0, lift: 0, pick: 0, alpha: 1 };

    this.#shadow = new QuadMesh(art.hud.shadow);
    this.#shadow.alpha = 0.9;
    this.#rim = new QuadMesh(art.hud.glow(EVOLVED_RIM));
    this.#rim.visible = false;
    this.#body = new QuadMesh(art.textures.back());
    this.#glow = new QuadMesh(art.hud.glow(COLOR.legal));
    this.#glow.visible = false;
    this.#atk = new Text({ text: '', resolution: 2, style: PLATE, anchor: 0.5 });
    this.#def = new Text({ text: '', resolution: 2, style: PLATE, anchor: 0.5 });
    this.#keys = new Text({
      text: '',
      resolution: 2,
      style: { fontFamily: FONTS.body, fontSize: 10, fontWeight: '700', fill: COLOR.parchment },
      anchor: 0.5,
    });
    this.#carrot = new Sprite({ texture: art.hud.carrot, anchor: 0.5 });
    this.#carrotCount = new Text({
      text: '',
      resolution: 2,
      style: { fontFamily: FONTS.display, fontSize: 11, fontWeight: '700', fill: COLOR.parchment },
      anchor: 0,
    });
    this.#badge = new Text({
      text: 'text not automated',
      resolution: 2,
      style: { fontFamily: FONTS.body, fontSize: 8, fontWeight: '700', fill: COLOR.goldBright },
      anchor: 0.5,
    });
    for (const overlay of [
      this.#atk,
      this.#def,
      this.#keys,
      this.#carrot,
      this.#carrotCount,
      this.#badge,
    ]) {
      overlay.eventMode = 'none';
    }
    this.addChild(
      this.#shadow,
      this.#rim,
      this.#body,
      this.#glow,
      this.#atk,
      this.#def,
      this.#keys,
      this.#carrot,
      this.#carrotCount,
      this.#badge,
    );

    // Pick where the card is seen to be: a card lying on the table is a trapezoid.
    this.hitArea = { contains: (x, y) => insideQuad(this.#corners, x, y) };
    this.zIndex = slot.z;
    this.refresh();
  }

  get highlight(): Highlight {
    return this.#highlight;
  }

  /** Adopt a new slot - the same card, possibly in a new zone. Does not move the actor. */
  place(slot: CardSlot): void {
    const before = this.slot;
    this.slot = slot;
    this.#restack();
    const sameLook =
      before.ref?.def === slot.ref?.def &&
      before.evolved?.ref.def === slot.evolved?.ref.def &&
      before.evolved?.superEvolved === slot.evolved?.superEvolved;
    if (!sameLook) this.refresh();
  }

  /** Redraw from the catalog: the face may have been unknown, or its art may just have arrived. */
  refresh(): void {
    const { ref, evolved } = this.slot;
    const def = evolved?.ref.def ?? ref?.def;
    this.#face = def ? this.#art.textures.face(def, this.#art.onFaceChange) : null;

    this.#rim.visible = evolved !== null;
    if (evolved)
      this.#rim.texture = this.#art.hud.glow(
        evolved.superEvolved ? COLOR.superEvolution : EVOLVED_RIM,
      );
    this.sync();
  }

  setHighlight(highlight: Highlight): void {
    this.#highlight = highlight;
    this.#glow.visible = highlight !== 'none';
    if (highlight !== 'none') {
      this.#glow.texture = this.#art.hud.glow(
        highlight === 'selected' ? COLOR.selected : COLOR.legal,
      );
    }
  }

  setHover(hovered: boolean): void {
    this.#hovered = hovered;
    this.#restack();
  }

  #restack(): void {
    this.zIndex = this.#hovered ? HOVER_Z : this.slot.z;
  }

  /** Push the animated numbers onto the meshes. Called every frame. */
  sync(time = 0): void {
    const { pose, slot } = this;
    const lift = Math.max(pose.lift, pose.pick * 0.45);
    const hover = HOVER[slot.zone];
    const scale = pose.scale * (1 + lift * hover.zoom);

    // A card being read stands up: it leaves the table (or the hand's lean) and faces the player.
    const standing = Math.min(1, lift * 1.6);
    const flat = slot.flat * (1 - standing);
    const rotation = pose.rotation * (1 - standing);

    let { x, y } = pose;
    y -= lift * hover.rise * pose.scale;
    if (lift > 0) {
      // A grown card never spills off the table.
      const halfW = HALF.width * scale + 8;
      const halfH = HALF.height * scale + 8;
      x = Math.min(Math.max(x, halfW), DESIGN.width - halfW);
      y = Math.min(Math.max(y, halfH), DESIGN.height - halfH);
    }

    // Edge-on half way through the flip, which is also when the texture changes.
    const showFace = pose.flip >= 0.5 && this.#face !== null;
    const texture = showFace && this.#face ? this.#face : this.#art.textures.back();
    if (this.#body.texture !== texture) this.#body.texture = texture;
    const width = Math.max(0.001, Math.abs(1 - 2 * pose.flip));

    const camera = this.#art.camera();
    const quad = { x, y, scale, rotation, flat, width };
    this.#corners = cornersOf(camera, quad, HALF.width, HALF.height);
    this.#body.setQuad(this.#corners);
    this.alpha = pose.alpha;

    // The shadow falls toward the viewer, and further the higher the card is held.
    const drop = (SHADOW_DROP + lift * 18) * scale;
    const halo = { width: HALF.width + HALO, height: HALF.height + HALO };
    this.#shadow.setQuad(cornersOf(camera, { ...quad, y: y + drop }, halo.width, halo.height));
    this.#shadow.alpha = 0.9 - lift * 0.15;
    if (this.#rim.visible) this.#rim.setQuad(cornersOf(camera, quad, halo.width, halo.height));

    if (this.#highlight !== 'none') {
      this.#glow.setQuad(cornersOf(camera, quad, halo.width, halo.height));
      this.#glow.alpha =
        this.#highlight === 'selected' ? 1 : 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(time / 260));
    }

    const shown = slot.shown;
    const faceUp = showFace;
    const printed = this.#art.catalog()(
      slot.evolved?.ref.def ?? slot.ref?.def ?? ('' as CardDefId),
    );
    const showStats =
      shown !== null &&
      faceUp &&
      (slot.zone === 'field' ||
        (slot.zone === 'ex' &&
          typeof printed?.attack === 'number' &&
          typeof printed?.defense === 'number'));
    this.#atk.visible = showStats;
    this.#def.visible = showStats;
    if (showStats && shown) {
      this.#atk.text = String(shown.attack);
      this.#def.text = String(shown.defense);
      this.#atk.style.fill =
        printed?.attack !== null && printed?.attack !== undefined && shown.attack > printed.attack
          ? COLOR.buffed
          : shown.attack < (printed?.attack ?? shown.attack)
            ? COLOR.danger
            : 0xffffff;
      this.#def.style.fill =
        printed?.defense !== null &&
        printed?.defense !== undefined &&
        shown.defense > printed.defense
          ? COLOR.buffed
          : shown.defense < (printed?.defense ?? shown.defense)
            ? COLOR.danger
            : 0xffffff;
      this.#atk.position.set(x - HALF.width * scale * 0.72, y + HALF.height * scale * 0.78);
      this.#def.position.set(x + HALF.width * scale * 0.72, y + HALF.height * scale * 0.78);
      const marks = shown.keywords
        .map((keyword) => KEY_MARK[keyword])
        .filter(Boolean)
        .join(' ');
      const counters = Object.entries(slot.counters)
        .filter(([, n]) => n > 0)
        .map(([name, n]) => `${name.slice(0, 1).toUpperCase()}${n}`)
        .join(' ');
      this.#keys.text = [marks, counters].filter((part) => part.length > 0).join(' ');
      this.#keys.visible = this.#keys.text.length > 0;
      this.#keys.position.set(x, y - HALF.height * scale * 0.82);
    } else {
      this.#keys.visible = false;
    }

    const raced = slot.zone === 'field' ? slot.racedTimes : 0;
    this.#carrot.visible = raced > 0;
    this.#carrotCount.visible = raced > 1;
    if (raced > 0) {
      const hop = 1 + this.carrotHop.amount * 0.35;
      this.#carrot.scale.set(hop);
      this.#carrot.position.set(x + HALF.width * scale * 0.78, y - HALF.height * scale * 0.78);
      this.#carrotCount.text = String(raced);
      this.#carrotCount.position.set(this.#carrot.x + 8, this.#carrot.y - 4);
    }

    const defId = slot.evolved?.ref.def ?? slot.ref?.def;
    const def = defId ? this.#art.catalog()(defId) : undefined;
    const unscripted = Boolean(def?.scripted === false && def.text.length > 0 && faceUp);
    this.#badge.visible = unscripted;
    if (unscripted) this.#badge.position.set(x, y + HALF.height * scale * 0.52);
  }
}

// ---------------------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------------------

const PILL_STYLE = {
  fontFamily: FONTS.body,
  fontSize: 13,
  fontWeight: '700',
  fill: COLOR.parchment,
} as const;

/** The most cards a stack is drawn with, however large the pile. */
const MAX_LAYERS = 7;
const CARDS_PER_LAYER = 8;
const EVOLVE_TINT = 0xcdb8ff;

/**
 * A face-down stack with its count on it. Cemetery and banished piles draw no stack of their
 * own - their top cards are card actors - only the count.
 */
export class PileActor extends Container {
  slot: PileSlot;
  readonly #art: Art;
  readonly #stack = new Container();
  readonly #layers: Sprite[] = [];
  readonly #pill = new Container();
  readonly #pillBack = new Graphics();
  readonly #pillText: Text;
  /** Animated by cues: a shake and a tilt, a flash of red. All zero at rest. */
  readonly wobble = { x: 0, rotation: 0, flash: 0 };

  constructor(slot: PileSlot, art: Art) {
    super();
    this.slot = slot;
    this.#art = art;
    this.#pillText = new Text({ text: '', resolution: 2, style: PILL_STYLE, anchor: 0.5 });
    this.#pill.addChild(this.#pillBack, this.#pillText);
    this.addChild(this.#stack, this.#pill);
    this.update(slot);
  }

  #drawsStack(): boolean {
    return this.slot.kind === 'deck' || this.slot.kind === 'evolve';
  }

  update(slot: PileSlot): void {
    this.slot = slot;
    const { pose, count, kind } = slot;
    this.#stack.scale.set(pose.scale);

    const stacked = this.#drawsStack();
    if (stacked) {
      const wanted =
        count === 0 ? 0 : Math.min(MAX_LAYERS, 1 + Math.floor(count / CARDS_PER_LAYER));
      while (this.#layers.length < wanted) {
        const layer = new Sprite({ texture: this.#art.textures.back(), anchor: 0.5 });
        layer.scale.set(CARD.width / layer.texture.width, CARD.height / layer.texture.height);
        if (kind === 'evolve') layer.tint = EVOLVE_TINT;
        // Later layers sit higher and a little left, so the stack has thickness.
        layer.position.set(-this.#layers.length * 1.1, -this.#layers.length * 1.4);
        this.#layers.push(layer);
        this.#stack.addChild(layer);
      }
      this.#layers.forEach((layer, index) => {
        layer.visible = index < wanted;
      });
    }

    const showCount = stacked || count > 0;
    this.#pill.visible = showCount;
    if (showCount) {
      this.#pillText.text = String(count);
      const width = Math.max(24, this.#pillText.width + 14);
      this.#pillBack
        .clear()
        .roundRect(-width / 2, -10, width, 20, 10)
        .fill({ color: COLOR.ink, alpha: 0.82 })
        .stroke({ width: 1, color: COLOR.gold, alpha: 0.7 });
      const half = { x: (CARD.width * pose.scale) / 2, y: (CARD.height * pose.scale) / 2 };
      // A stack carries its count on the pile; a face-up pile carries it just beneath.
      this.#pill.position.set(half.x - 4, stacked ? half.y - 6 : half.y + 10);
    }
    this.sync();
  }

  /** Per frame: the cue wobble on top of the resting place. */
  sync(): void {
    this.position.set(this.slot.pose.x + this.wobble.x, this.slot.pose.y);
    this.#stack.rotation = this.wobble.rotation;
    this.#pillBack.tint = this.wobble.flash > 0 ? COLOR.danger : 0xffffff;
  }
}

// ---------------------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------------------

const DEFENSE_STYLE = {
  fontFamily: FONTS.display,
  fontSize: 22,
  fontWeight: '700',
  fill: COLOR.parchment,
  stroke: { color: COLOR.ink, width: 3 },
} as const;

/** A leader card on the rail, its defense on a shield, and a ring for whose turn it is. */
export class AvatarActor extends Container {
  slot: AvatarSlot;
  readonly #art: Art;
  readonly #ring: Sprite;
  readonly #glow: Sprite;
  readonly #face: Sprite;
  readonly #shield: Sprite;
  readonly #defense: Text;
  /** Animated by cues; both settle at rest (0 and 1). */
  readonly state = { ring: 0, pop: 1 };

  constructor(slot: AvatarSlot, art: Art) {
    super();
    this.slot = slot;
    this.#art = art;
    this.#ring = new Sprite({ texture: art.hud.leaderHalo, anchor: 0.5, alpha: 0 });
    this.#glow = new Sprite({ texture: art.hud.glow(COLOR.legal), anchor: 0.5, visible: false });
    this.#face = new Sprite({ anchor: 0.5 });
    this.#shield = new Sprite({ texture: art.hud.shield, anchor: 0.5 });
    this.#defense = new Text({ text: '', resolution: 2, style: DEFENSE_STYLE, anchor: 0.5 });
    this.#defense.y = -2;
    this.#shield.addChild(this.#defense);
    this.addChild(this.#ring, this.#glow, this.#face, this.#shield);
    const scale = LEADER_CARD.width / CARD.width;
    this.#glow.scale.set(scale);
    this.eventMode = 'static';
    this.cursor = 'default';
    this.hitArea = {
      contains: (x: number, y: number) =>
        Math.abs(x) <= LEADER_CARD.width / 2 && Math.abs(y) <= LEADER_CARD.height / 2,
    };
    this.update(slot);
  }

  update(slot: AvatarSlot): void {
    this.slot = slot;
    this.position.set(slot.position.x, slot.position.y);
    this.#shield.position.set(slot.shield.x - slot.position.x, slot.shield.y - slot.position.y);
    this.#defense.text = String(slot.defense);
    this.#face.texture = this.#art.textures.face(slot.leader.def, this.#art.onFaceChange);
    // Art files are full card scans at their own pixel size; pin the sprite to the rail card.
    this.#face.width = LEADER_CARD.width;
    this.#face.height = LEADER_CARD.height;
  }

  setTargeted(targeted: boolean): void {
    this.#glow.visible = targeted;
    this.cursor = targeted ? 'pointer' : 'default';
    if (targeted) this.state.ring = 1;
  }

  /** The ring: bright on your turn, breathing while the match waits on you. */
  sync(time: number): void {
    const { active, waiting } = this.slot;
    const resting = waiting ? 0.5 + 0.35 * Math.sin(time / 380) : active ? 0.85 : 0;
    this.#ring.alpha = Math.max(resting, this.state.ring);
    this.#ring.scale.set(1 + this.state.ring * 0.08);
    this.#shield.scale.set(this.state.pop);
  }
}

// ---------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------

export type Resource = 'playPoints' | 'evolutionPoints' | 'superEvolutionPoints';

const ORB_STEP = 25;
const ORB_COLORS: Readonly<Record<Resource, number>> = {
  playPoints: COLOR.playPoint,
  evolutionPoints: COLOR.evolution,
  superEvolutionPoints: COLOR.superEvolution,
};
/** The most orbs a row has room for. */
const ORB_ROOM: Readonly<Record<Resource, number>> = {
  playPoints: 10,
  evolutionPoints: 5,
  superEvolutionPoints: 3,
};

/**
 * Play points, evolution points and super-evolution points as rows of orbs. No labels: colour
 * says which is which, and a lit orb is one you have.
 */
export class OrbTrayActor extends Container {
  slot: OrbTraySlot;
  readonly #art: Art;
  readonly #rows: Readonly<Record<Resource, Sprite[]>>;
  /** Animated by cues: a swell on the orbs of whichever resource just changed. */
  readonly pulse = { resource: 'playPoints' as Resource, amount: 0 };

  constructor(slot: OrbTraySlot, art: Art) {
    super();
    this.slot = slot;
    this.#art = art;
    const row = (resource: Resource, x: number, y: number): Sprite[] =>
      Array.from({ length: ORB_ROOM[resource] }, (_, index) => {
        const orb = new Sprite({ texture: art.hud.orbDim(ORB_COLORS[resource]), anchor: 0.5 });
        orb.position.set(ORB_SIZE / 2 + x + index * ORB_STEP, ORB_SIZE / 2 + y);
        this.addChild(orb);
        return orb;
      });
    this.#rows = {
      playPoints: row('playPoints', 0, 0),
      evolutionPoints: row('evolutionPoints', 0, ORB_STEP + 2),
      superEvolutionPoints: row(
        'superEvolutionPoints',
        (ORB_ROOM.evolutionPoints + 0.4) * ORB_STEP,
        ORB_STEP + 2,
      ),
    };
    this.update(slot);
  }

  update(slot: OrbTraySlot): void {
    this.slot = slot;
    this.position.set(slot.origin.x, slot.origin.y);
    const lit: Record<Resource, number> = {
      playPoints: slot.playPoints,
      evolutionPoints: slot.evolutionPoints,
      superEvolutionPoints: slot.superEvolutionPoints,
    };
    // Play points show every orb you have this turn, spent or not; the others only those you hold.
    const shown: Record<Resource, number> = { ...lit, playPoints: slot.maxPlayPoints };
    for (const resource of Object.keys(this.#rows) as Resource[]) {
      this.#rows[resource].forEach((orb, index) => {
        orb.visible = index < shown[resource];
        orb.texture =
          index < lit[resource]
            ? this.#art.hud.orbLit(ORB_COLORS[resource])
            : this.#art.hud.orbDim(ORB_COLORS[resource]);
      });
    }
  }

  sync(): void {
    for (const resource of Object.keys(this.#rows) as Resource[]) {
      const swell = resource === this.pulse.resource ? this.pulse.amount : 0;
      for (const orb of this.#rows[resource]) orb.scale.set(1 + swell * 0.35);
    }
  }
}
