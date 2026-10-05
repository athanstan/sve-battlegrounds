import type { CardDefId, CardId, CardRef, ResourceName, Seat } from '@sve/rules';
import { type Container, Sprite } from 'pixi.js';
import type { Cue } from '../cues';
import {
  pileKey,
  type ActorKey,
  type CardSlot,
  type Layout,
  type PileKind,
  type Pose,
} from '../layout';
import type { SelectionSpec } from '../selection';
import { DESIGN } from '../theme';
import {
  AvatarActor,
  CardActor,
  OrbTrayActor,
  PileActor,
  type Art,
  type CardPose,
  type Resource,
} from './actors';
import type { Motion } from './motion';
import { isPulsing } from './pacing';

/**
 * The board: a pool of actors kept in step with a `Layout`.
 *
 * `apply` is the only thing that decides where a card is. Given the layout that is now true, it
 * creates what is new, retargets what has moved and retires what is gone; where a new card comes
 * from, and where a retired one goes, is read off the two layouts rather than off events.
 * Played without animation, the same call lays the board down in its final state.
 */

export interface BoardLayers {
  readonly piles: Container;
  readonly cards: Container;
  readonly hud: Container;
}

export interface BoardDeps {
  readonly layers: BoardLayers;
  readonly art: Art;
  readonly motion: Motion;
  /**
   * The board changed in a way no tween announces: a new layout, a selection, a highlight, a
   * face that has just arrived. A frame has to be drawn for it.
   */
  readonly invalidate: () => void;
  /** A card the viewer is allowed to pick was clicked. */
  readonly onPick: (id: CardId) => void;
  readonly onCardPress?: (id: CardId, at: { x: number; y: number }) => void;
  readonly onAvatarPress?: (seat: Seat) => void;
  readonly onPilePress?: (seat: Seat, kind: PileKind) => void;
  /** The pointer is over a face-up card (`ref`), or has left every card (`null`). */
  readonly onCardHover?: (ref: CardRef | null, at: { x: number; y: number }) => void;
}

const TRAVEL = 0.5;
const FLIP = 0.45;
const DRAW_STAGGER = 0.13;
const FADE = 0.25;

const resourceRow = (resource: ResourceName): Resource | null => {
  switch (resource) {
    case 'playPoints':
    case 'maxPlayPoints':
      return 'playPoints';
    case 'evolutionPoints':
    case 'superEvolutionPoints':
      return resource;
    case 'turnsPassed':
      return null;
  }
};

export class Board {
  readonly #deps: BoardDeps;
  readonly #cards = new Map<ActorKey, CardActor>();
  readonly #leaving = new Set<CardActor>();
  readonly #piles = new Map<ActorKey, PileActor>();
  readonly #avatars = new Map<Seat, AvatarActor>();
  readonly #trays = new Map<Seat, OrbTrayActor>();
  #selection: { readonly spec: SelectionSpec; readonly picked: readonly CardId[] } | null = null;
  #highlight: ReadonlySet<CardId> = new Set();
  #leaderTargets: ReadonlySet<Seat> = new Set();
  /** The card under the pointer, and where the pointer last was, for the inspector. */
  #hovered: CardActor | null = null;
  #hoverAt = { x: 0, y: 0 };
  /** A reveal holds the face it was given. That face is replaced when art arrives, so the sprite
   *  must be pointed at the new texture before the old one is destroyed. */
  readonly #reveals: { readonly sprite: Sprite; readonly def: CardDefId }[] = [];

  constructor(deps: BoardDeps) {
    this.#deps = deps;
    deps.layers.cards.sortableChildren = true;
  }

  /** Bring the board to `layout`. With `animate` off it lands there at once. */
  apply(layout: Layout, animate: boolean): void {
    const instant = !animate;
    this.#applyPiles(layout);
    this.#applyCards(layout, instant);
    this.#applyHud(layout);
    this.#paintSelection();
    this.#deps.invalidate();
  }

  /** Something happened that a view cannot show: a shuffle, a failed draw, a resource change. */
  cue(cue: Cue): void {
    const { motion } = this.#deps;
    switch (cue.kind) {
      case 'shuffle': {
        const pile = this.#piles.get(pileKey(cue.seat, 'deck'));
        if (pile) {
          motion.steps(pile.wobble, [
            { rotation: 0.16, x: 4, duration: 0.07 },
            { rotation: -0.16, x: -4, duration: 0.1 },
            { rotation: 0.1, x: 3, duration: 0.08 },
            { rotation: 0, x: 0, duration: 0.1 },
          ]);
        }
        return;
      }
      case 'emptyDeck': {
        const pile = this.#piles.get(pileKey(cue.seat, 'deck'));
        if (pile) {
          motion.burst(pile.wobble, { flash: 1 }, { flash: 0, duration: 0.9, ease: 'steps(1)' });
          motion.steps(pile.wobble, [
            { x: -5, duration: 0.05 },
            { x: 5, duration: 0.07 },
            { x: -3, duration: 0.06 },
            { x: 0, duration: 0.06 },
          ]);
        }
        return;
      }
      case 'resource': {
        const tray = this.#trays.get(cue.seat);
        const row = resourceRow(cue.resource);
        if (tray && row) {
          tray.pulse.resource = row;
          motion.burst(tray.pulse, { amount: 1 }, { amount: 0, duration: 0.6 });
        }
        return;
      }
      case 'turn': {
        const avatar = this.#avatars.get(cue.seat);
        if (avatar) motion.burst(avatar.state, { ring: 1 }, { ring: 0, duration: 1 });
        return;
      }
      case 'reveal': {
        this.#showReveal(cue.cards);
        return;
      }
      case 'gameOver':
        return;
    }
  }

  /** Cards that may be picked glow; picked ones glow brighter and rise. `null` ends picking. */
  setSelection(spec: SelectionSpec | null, picked: readonly CardId[]): void {
    this.#selection = spec ? { spec, picked } : null;
    this.#paintSelection();
    this.#deps.invalidate();
  }

  setHighlight(ids: readonly CardId[], leaders: readonly Seat[] = []): void {
    this.#highlight = new Set(ids);
    this.#leaderTargets = new Set(leaders);
    this.#paintSelection();
    this.#deps.invalidate();
  }

  /** A face the catalog just learned about (or finished loading art for) is redrawn. */
  refreshFaces(): void {
    for (const actor of this.#cards.values()) actor.refresh();
    for (const avatar of this.#avatars.values()) avatar.update(avatar.slot);
    for (const reveal of this.#reveals) {
      reveal.sprite.texture = this.#deps.art.textures.face(
        reveal.def,
        this.#deps.art.onFaceChange,
      );
    }
    this.#deps.art.textures.flushStale();
    this.#deps.invalidate();
  }

  /**
   * Is something on the board pulsing on its own clock? A legal target's glow and the ring of a
   * leader the match is waiting on breathe with the time, not with a tween.
   */
  pulsing(): boolean {
    return isPulsing(
      Array.from(this.#cards.values(), (actor) => actor.highlight),
      Array.from(this.#avatars.values(), (avatar) => avatar.slot.waiting),
    );
  }

  /** Per frame. */
  tick(time: number): void {
    for (const actor of this.#cards.values()) actor.sync(time);
    for (const actor of this.#leaving) actor.sync(time);
    for (const pile of this.#piles.values()) pile.sync();
    for (const avatar of this.#avatars.values()) avatar.sync(time);
    for (const tray of this.#trays.values()) tray.sync();
  }

  destroy(): void {
    const { motion } = this.#deps;
    for (const actor of [...this.#cards.values(), ...this.#leaving]) {
      motion.kill(actor.pose);
      actor.destroy({ children: true });
    }
    for (const pile of this.#piles.values()) {
      motion.kill(pile.wobble);
      pile.destroy({ children: true });
    }
    for (const avatar of this.#avatars.values()) {
      motion.kill(avatar.state);
      avatar.destroy({ children: true });
    }
    for (const tray of this.#trays.values()) {
      motion.kill(tray.pulse);
      tray.destroy({ children: true });
    }
    this.#cards.clear();
    this.#leaving.clear();
    this.#piles.clear();
    this.#avatars.clear();
    this.#trays.clear();
    this.#clearReveals();
  }

  // ---- piles, leaders, orbs ----------------------------------------------------------------

  #applyPiles(layout: Layout): void {
    const wanted = new Set<ActorKey>();
    for (const slot of layout.piles) {
      wanted.add(slot.key);
      const pile = this.#piles.get(slot.key);
      if (pile) {
        pile.update(slot);
      } else {
        const made = new PileActor(slot, this.#deps.art);
        made.eventMode = 'static';
        made.cursor = 'pointer';
        made.on('pointertap', () => this.#deps.onPilePress?.(slot.seat, slot.kind));
        this.#piles.set(slot.key, made);
        this.#deps.layers.piles.addChild(made);
      }
    }
    for (const [key, pile] of this.#piles) {
      if (wanted.has(key)) continue;
      this.#deps.motion.kill(pile.wobble);
      pile.destroy({ children: true });
      this.#piles.delete(key);
    }
  }

  #applyHud(layout: Layout): void {
    const { art, motion, layers } = this.#deps;
    for (const slot of layout.avatars) {
      const existing = this.#avatars.get(slot.seat);
      if (existing) {
        if (existing.slot.defense !== slot.defense) {
          motion.burst(
            existing.state,
            { pop: 1.35 },
            { pop: 1, duration: 0.5, ease: 'back.out(2)' },
          );
        }
        existing.update(slot);
      } else {
        const made = new AvatarActor(slot, art);
        made.eventMode = 'static';
        made.cursor = 'default';
        made.on('pointertap', () => this.#deps.onAvatarPress?.(slot.seat));
        made.on('pointerover', (event: { global: { x: number; y: number } }) => {
          this.#hoverAt = { x: event.global.x, y: event.global.y };
          this.#deps.onCardHover?.(made.slot.leader, this.#hoverAt);
        });
        made.on('pointerout', () => this.#deps.onCardHover?.(null, this.#hoverAt));
        this.#avatars.set(slot.seat, made);
        layers.hud.addChild(made);
      }
    }
    for (const slot of layout.trays) {
      const existing = this.#trays.get(slot.seat);
      if (existing) {
        existing.update(slot);
      } else {
        const made = new OrbTrayActor(slot, art);
        this.#trays.set(slot.seat, made);
        layers.hud.addChild(made);
      }
    }
  }

  // ---- cards -----------------------------------------------------------------------------

  #applyCards(layout: Layout, instant: boolean): void {
    const wanted = new Map<ActorKey, CardSlot>(layout.cards.map((slot) => [slot.key, slot]));
    const gone = [...this.#cards.values()].filter((actor) => !wanted.has(actor.slot.key));
    const arrivals = layout.cards.filter((slot) => !this.#cards.has(slot.key));
    const arrived = new Set(arrivals.map((slot) => slot.key));

    // A hidden card leaving a hand and a new card appearing elsewhere are, to the viewer, the
    // same card: the newcomer picks up where the hidden one was, so a played card is seen to
    // leave the hand rather than a card materialising on the field.
    const spare = new Map<Seat, CardActor[]>();
    for (const actor of gone) {
      if (actor.slot.zone !== 'hand' || actor.slot.ref !== null) continue;
      spare.set(actor.slot.seat, [...(spare.get(actor.slot.seat) ?? []), actor]);
    }
    // A card that leaves the table under the pointer never gets its `pointerout`.
    if (this.#hovered && gone.includes(this.#hovered)) this.#unhover();

    const adopted = new Set<CardActor>();
    const dealt = new Map<Seat, number>();

    for (const slot of arrivals) {
      const taken = slot.zone === 'hand' ? undefined : spare.get(slot.seat)?.pop();
      if (taken) adopted.add(taken);

      const actor = new CardActor(slot, this.#deps.art);
      this.#wire(actor);
      Object.assign(actor.pose, this.#originOf(slot, layout, taken));
      this.#cards.set(slot.key, actor);
      this.#deps.layers.cards.addChild(actor);

      let delay = 0;
      if (slot.zone === 'hand') {
        const order = dealt.get(slot.seat) ?? 0;
        dealt.set(slot.seat, order + 1);
        delay = order * DRAW_STAGGER;
      }
      this.#travel(actor, slot, delay, instant);
    }

    for (const slot of layout.cards) {
      const actor = this.#cards.get(slot.key);
      if (!actor) continue;
      // Only identified cards can be hovered or picked; a back tells the viewer nothing.
      actor.eventMode = slot.ref ? 'static' : 'none';
      if (this.#hovered === actor) {
        // The card under the pointer may have been turned over or changed what it is.
        if (slot.ref) this.#deps.onCardHover?.(slot.ref, this.#hoverAt);
        else this.#unhover();
      }
      if (arrived.has(slot.key)) continue;

      const before = actor.slot;
      actor.place(slot);
      if (slot.racedTimes > before.racedTimes) {
        this.#deps.motion.burst(actor.carrotHop, { amount: 1 }, { amount: 0, duration: 0.45 });
      }
      // Leave a card already on its way alone if its destination has not moved.
      if (instant || !samePlace(before, slot)) this.#travel(actor, slot, 0, instant);
    }

    for (const actor of gone) {
      this.#cards.delete(actor.slot.key);
      if (adopted.has(actor) || instant) {
        this.#deps.motion.kill(actor.pose);
        actor.destroy({ children: true });
        continue;
      }
      this.#retire(actor, layout);
    }
  }

  /** Where a card appears from. */
  #originOf(slot: CardSlot, layout: Layout, taken: CardActor | undefined): Partial<CardPose> {
    if (taken)
      return {
        x: taken.pose.x,
        y: taken.pose.y,
        scale: taken.pose.scale,
        rotation: taken.pose.rotation,
        flip: 0,
        alpha: 1,
      };

    if (slot.zone === 'hand') {
      const deck = layout.piles.find((pile) => pile.key === pileKey(slot.seat, 'deck'));
      if (deck)
        return {
          x: deck.pose.x,
          y: deck.pose.y,
          scale: deck.pose.scale,
          rotation: 0,
          flip: 0,
          alpha: 1,
        };
    }
    // Anything else with no hidden card to take over from came out of that seat's hand.
    const hand = layout.cards.filter((card) => card.seat === slot.seat && card.zone === 'hand');
    const middle = hand[Math.floor(hand.length / 2)];
    const from: Pose = middle?.pose ?? slot.pose;
    return { x: from.x, y: from.y, scale: from.scale, rotation: 0, flip: 0, alpha: 0 };
  }

  #travel(actor: CardActor, slot: CardSlot, delay: number, instant: boolean): void {
    const { motion } = this.#deps;
    const { x, y, scale, rotation } = slot.pose;
    motion.to(
      actor.pose,
      { x, y, scale, rotation, alpha: 1, duration: TRAVEL, delay, ease: 'power3.out' },
      instant,
    );
    motion.to(
      actor.pose,
      { flip: slot.ref ? 1 : 0, duration: FLIP, delay: delay + 0.12, ease: 'power2.inOut' },
      instant,
    );
  }

  /** A card that is no longer anywhere on the board: back to the deck from a hand, else a fade. */
  #retire(actor: CardActor, layout: Layout): void {
    const { motion } = this.#deps;
    const finish = (): void => {
      this.#leaving.delete(actor);
      if (!actor.destroyed) actor.destroy({ children: true });
    };
    this.#leaving.add(actor);
    actor.eventMode = 'none';

    const deck =
      actor.slot.zone === 'hand'
        ? layout.piles.find((pile) => pile.key === pileKey(actor.slot.seat, 'deck'))
        : undefined;
    if (deck) {
      motion.to(actor.pose, {
        x: deck.pose.x,
        y: deck.pose.y,
        scale: deck.pose.scale,
        rotation: 0,
        flip: 0,
        duration: TRAVEL,
        onComplete: finish,
      });
    } else {
      motion.to(actor.pose, { alpha: 0, duration: FADE, onComplete: finish });
    }
  }

  // ---- pointer ---------------------------------------------------------------------------

  #wire(actor: CardActor): void {
    actor.on('pointerover', (event) => {
      this.#hoverAt = { x: event.global.x, y: event.global.y };
      this.#hover(actor, true);
    });
    actor.on('pointerout', () => this.#hover(actor, false));
    actor.on('pointertap', (event) => {
      const id = actor.slot.ref?.id;
      if (!id) return;
      if (this.#selection?.spec.candidates.includes(id)) {
        this.#deps.onPick(id);
        return;
      }
      this.#deps.onCardPress?.(id, { x: event.global.x, y: event.global.y });
    });
  }

  #hover(actor: CardActor, hovered: boolean): void {
    actor.setHover(hovered);
    this.#deps.motion.to(actor.pose, { lift: hovered ? 1 : 0, duration: 0.16 });
    if (hovered) {
      this.#hovered = actor;
      if (actor.slot.ref) this.#deps.onCardHover?.(actor.slot.ref, this.#hoverAt);
    } else if (this.#hovered === actor) {
      this.#unhover();
    }
  }

  #unhover(): void {
    this.#hovered = null;
    this.#deps.onCardHover?.(null, this.#hoverAt);
  }

  #paintSelection(): void {
    const { motion } = this.#deps;
    for (const actor of this.#cards.values()) {
      const id = actor.slot.ref?.id;
      const legal =
        id !== undefined &&
        ((this.#selection?.spec.candidates.includes(id) ?? false) || this.#highlight.has(id));
      const picked = id !== undefined && (this.#selection?.picked.includes(id) ?? false);
      const next = picked ? 'selected' : legal ? 'legal' : 'none';
      actor.cursor = legal || Boolean(this.#deps.onCardPress) ? 'pointer' : 'default';
      if (actor.highlight === next) continue;
      actor.setHighlight(next);
      motion.to(actor.pose, { pick: picked ? 1 : 0, duration: 0.18 });
    }
    for (const avatar of this.#avatars.values()) {
      const targeted = this.#leaderTargets.has(avatar.slot.seat);
      avatar.setTargeted(targeted);
    }
  }

  #showReveal(cards: readonly CardRef[]): void {
    this.#clearReveals();
    cards.forEach((ref, index) => {
      const texture = this.#deps.art.textures.face(ref.def, this.#deps.art.onFaceChange);
      const sprite = new Sprite({ texture, anchor: 0.5 });
      sprite.position.set(
        DESIGN.width / 2 + (index - (cards.length - 1) / 2) * 130,
        DESIGN.height / 2,
      );
      sprite.scale.set(1.35);
      sprite.eventMode = 'none';
      this.#deps.layers.cards.addChild(sprite);
      this.#reveals.push({ sprite, def: ref.def });
      this.#deps.motion.to(sprite, {
        alpha: 0,
        duration: 1.6,
        delay: 0.9,
        onComplete: () => {
          const index = this.#reveals.findIndex((entry) => entry.sprite === sprite);
          if (index >= 0) this.#reveals.splice(index, 1);
          if (!sprite.destroyed) sprite.destroy();
        },
      });
    });
  }

  #clearReveals(): void {
    for (const { sprite } of this.#reveals.splice(0)) {
      this.#deps.motion.kill(sprite);
      if (!sprite.destroyed) sprite.destroy();
    }
  }
}

/** The same destination: the card has not been asked to go anywhere new. */
function samePlace(a: CardSlot, b: CardSlot): boolean {
  return (
    a.pose.x === b.pose.x &&
    a.pose.y === b.pose.y &&
    a.pose.scale === b.pose.scale &&
    a.pose.rotation === b.pose.rotation &&
    (a.ref === null) === (b.ref === null)
  );
}
