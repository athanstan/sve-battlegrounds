import {
  opponentOf,
  type CardId,
  type CardRef,
  type MatchView,
  type Seat,
  type ShownStats,
} from '@sve/rules';
import type { Camera, Point } from './camera';
import { CARD, DESIGN, LEADER_CARD, RAIL } from './theme';

/**
 * Where everything on the board goes, as a pure function of a view.
 *
 * Nothing here knows about Pixi, animation, or the network: a view goes in, a description of
 * the board comes out. The scene (`scene/`) reconciles its sprites against this description, so
 * the picture on screen is always the view, whatever the animations did on the way.
 */

export type Zone = 'hand' | 'field' | 'ex' | 'cemetery' | 'banished' | 'resolution';
export type PileKind = 'deck' | 'evolve' | 'cemetery' | 'banished';

/** Identifies one sprite across layouts so it can be moved rather than recreated. */
export type ActorKey = string;

export const cardKey = (id: CardId): ActorKey => `card:${id}`;
export const backKey = (seat: Seat, zone: Zone, index: number): ActorKey =>
  `back:${seat}:${zone}:${index}`;
export const pileKey = (seat: Seat, kind: PileKind): ActorKey => `pile:${seat}:${kind}`;

/** Position, size and tilt in design space. Cards are drawn centred on `x, y`. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Radians, clockwise. */
  readonly rotation: number;
}

export interface CardSlot {
  readonly key: ActorKey;
  readonly seat: Seat;
  readonly zone: Zone;
  /** Null for a card the viewer cannot identify: it is drawn as a back. */
  readonly ref: CardRef | null;
  readonly pose: Pose;
  readonly z: number;
  /**
   * How much the card lies on the table, 0 to 1. A table card is a quad on the table plane,
   * foreshortened by the camera; a card held in a hand faces the player almost squarely.
   */
  readonly flat: number;
  /** Position in its zone, left to right. */
  readonly index: number;
  /** Turned sideways on the field. */
  readonly engaged: boolean;
  /** The evolved form standing in this slot, if any. */
  readonly evolved: { readonly ref: CardRef; readonly superEvolved: boolean } | null;
  /** Field stats the engine currently shows; null off the field. */
  readonly shown: ShownStats | null;
  readonly racedTimes: number;
  readonly counters: Readonly<Record<string, number>>;
}

export interface PileSlot {
  readonly key: ActorKey;
  readonly seat: Seat;
  readonly kind: PileKind;
  readonly count: number;
  readonly pose: Pose;
}

export interface AvatarSlot {
  readonly seat: Seat;
  readonly position: Point;
  readonly shield: Point;
  readonly size: { readonly width: number; readonly height: number };
  readonly leader: CardRef;
  readonly defense: number;
  /** It is this seat's turn. */
  readonly active: boolean;
  /** The match is waiting on this seat for an answer. */
  readonly waiting: boolean;
}

export interface OrbTraySlot {
  readonly seat: Seat;
  readonly origin: Point;
  readonly playPoints: number;
  readonly maxPlayPoints: number;
  readonly evolutionPoints: number;
  readonly superEvolutionPoints: number;
}

export interface Layout {
  /** The seat drawn at the near edge. */
  readonly viewpoint: Seat;
  readonly cards: readonly CardSlot[];
  readonly piles: readonly PileSlot[];
  readonly avatars: readonly AvatarSlot[];
  readonly trays: readonly OrbTraySlot[];
  /** The game is over: the board is shown settled. */
  readonly over: boolean;
}

/**
 * Table-plane rows, in table units; negative is the far side. Only the field and the EX rows lie
 * on the table. Hands are held up to the player, so they live on the screen edges (`HAND`).
 *
 * The camera foreshortens the far side, so its rows sit further apart on the plane to keep cards
 * from covering each other.
 */
const ROWS = {
  near: { ex: 285, field: 130 },
  far: { ex: -360, field: -170 },
} as const;
const CENTRE = 0;

/** What a card measures on the table relative to its drawn size: all rows share one unit. */
const UNIT = 1;

const SPACING = { field: 142, ex: 100, cemetery: 2.2 } as const;
/** Relative sizes. The rail piles are on screen, not on the table, so they carry their own unit. */
const SCALE = {
  ex: 0.72,
  resolution: 1.5,
  deck: 0.74,
  evolve: 0.56,
  cemetery: 0.74,
  banished: 0.56,
} as const;
const MAX_PILE_CARDS = 3;

/** Draw order: table piles sit under field cards, hands sit in front of everything. */
const Z = {
  pile: 10,
  field: 20,
  ex: 30,
  resolution: 40,
  hand: 50,
} as const;

/**
 * A hand: a fan along the bottom edge of the screen for the local player, along the top edge for
 * the opponent, always in screen space. `shown` is how much of each card is on screen, so the
 * hands read as held at the rim of the table rather than floating over it.
 */
const HAND = {
  near: { scale: 1.1, shown: 0.8, step: 112, span: 780, droop: 4.5, turn: 0.055 },
  far: { scale: 0.78, shown: 0.6, step: 80, span: 560, droop: 3.4, turn: 0.055 },
} as const;

/** How much a card lies on the table, by zone (see `CardSlot.flat`). */
const FLAT = { table: 1, hand: 0.3, pile: 0 } as const;

const rest = { engaged: false, evolved: null, shown: null, racedTimes: 0, counters: {} } as const;

/** Which seat to draw at the near edge: a player's own, or seat 0 for someone watching. */
export function viewpointOf(view: MatchView): Seat {
  return view.viewer.kind === 'seat' ? view.viewer.seat : 0;
}

const centred = (index: number, count: number): number => index - (count - 1) / 2;

/** A row of cards across the table, centred, on one table-plane line. */
function rowPose(
  camera: Camera,
  tableY: number,
  index: number,
  count: number,
  spacing: number,
  scale: number,
): Pose {
  const p = camera.project(centred(index, count) * spacing, tableY);
  return { x: p.x, y: p.y, scale: p.scale * scale * UNIT, rotation: 0 };
}

/** A hand is a fan, curving around its owner and tilting outward from the screen edge. */
function handPose(near: boolean, index: number, count: number): Pose {
  const hand = near ? HAND.near : HAND.far;
  const offset = centred(index, count);
  const step = Math.min(hand.step, hand.span / Math.max(count, 1));
  const height = CARD.height * hand.scale;
  const sign = near ? 1 : -1;
  // The card's rim sits on the screen edge, `shown` of it inside.
  const edge = near
    ? DESIGN.height + height / 2 - hand.shown * height
    : -height / 2 + hand.shown * height;
  return {
    x: DESIGN.width / 2 + offset * step,
    y: edge + offset * offset * hand.droop * sign,
    scale: hand.scale,
    rotation: offset * hand.turn * sign,
  };
}

export function computeLayout(view: MatchView, camera: Camera): Layout {
  const viewpoint = viewpointOf(view);
  const cards: CardSlot[] = [];
  const piles: PileSlot[] = [];
  const avatars: AvatarSlot[] = [];
  const trays: OrbTraySlot[] = [];

  for (const seat of [opponentOf(viewpoint), viewpoint] as const) {
    const near = seat === viewpoint;
    const rows = near ? ROWS.near : ROWS.far;
    const rail = near ? RAIL.near : RAIL.far;
    const data = view.seats[seat];

    // ---- hand -----------------------------------------------------------------------
    const handCount = data.hand.count;
    for (let index = 0; index < handCount; index++) {
      const ref = data.hand.cards?.[index] ?? null;
      cards.push({
        key: ref ? cardKey(ref.id) : backKey(seat, 'hand', index),
        seat,
        zone: 'hand',
        ref,
        pose: handPose(near, index, handCount),
        z: Z.hand + index,
        flat: FLAT.hand,
        index,
        ...rest,
      });
    }

    // ---- field ----------------------------------------------------------------------
    data.field.forEach((entry, index) => {
      const link = data.evolveZone.find((candidate) => candidate.linkedTo === entry.card.id);
      cards.push({
        key: cardKey(entry.card.id),
        seat,
        zone: 'field',
        ref: entry.card,
        pose: {
          ...rowPose(camera, rows.field, index, data.field.length, SPACING.field, 1),
          rotation: entry.placement === 'engaged' ? Math.PI / 2 : 0,
        },
        z: Z.field + index,
        flat: FLAT.table,
        index,
        engaged: entry.placement === 'engaged',
        evolved: link ? { ref: link.card, superEvolved: link.superEvolved } : null,
        shown: entry.shown,
        racedTimes: entry.racedTimes,
        counters: entry.counters,
      });
    });

    // ---- EX: always face up, public to everyone (4.7) --------------------------------
    data.ex.forEach((ref, index) => {
      cards.push({
        key: cardKey(ref.id),
        seat,
        zone: 'ex',
        ref,
        pose: rowPose(camera, rows.ex, index, data.ex.length, SPACING.ex, SCALE.ex),
        z: Z.ex + index,
        flat: FLAT.table,
        index,
        ...rest,
      });
    });

    // ---- piles ----------------------------------------------------------------------
    const pile = (kind: PileKind, count: number, scale: number) => {
      const anchor = rail[kind];
      piles.push({
        key: pileKey(seat, kind),
        seat,
        kind,
        count,
        pose: { x: anchor.x, y: anchor.y, scale, rotation: 0 },
      });
      return anchor;
    };

    pile('deck', data.deck.count, SCALE.deck);
    pile('evolve', data.evolveDeck.count, SCALE.evolve);

    const cemetery = data.cemetery;
    if (cemetery.length > 0) {
      const anchor = pile('cemetery', cemetery.length, SCALE.cemetery);
      cemetery.slice(-MAX_PILE_CARDS).forEach((ref, offset, shown) => {
        const depth = shown.length - 1 - offset; // 0 is the top card
        cards.push({
          key: cardKey(ref.id),
          seat,
          zone: 'cemetery',
          ref,
          pose: {
            x: anchor.x - depth * SPACING.cemetery,
            y: anchor.y - depth * SPACING.cemetery,
            scale: SCALE.cemetery,
            rotation: (depth % 2 === 0 ? 1 : -1) * depth * 0.035,
          },
          z: Z.pile + offset,
          flat: FLAT.pile,
          index: cemetery.length - shown.length + offset,
          ...rest,
        });
      });
    }

    const banished = data.banished;
    if (banished.length > 0) {
      const anchor = pile('banished', banished.length, SCALE.banished);
      banished.slice(-MAX_PILE_CARDS).forEach((entry, offset, shown) => {
        const depth = shown.length - 1 - offset;
        const index = banished.length - shown.length + offset;
        cards.push({
          // A face-down banished card has no identity the viewer may use.
          key: entry.card ? cardKey(entry.card.id) : backKey(seat, 'banished', index),
          seat,
          zone: 'banished',
          ref: entry.card,
          pose: {
            x: anchor.x - depth * SPACING.cemetery,
            y: anchor.y - depth * SPACING.cemetery,
            scale: SCALE.banished,
            rotation: 0,
          },
          z: Z.pile + offset,
          flat: FLAT.pile,
          index,
          ...rest,
        });
      });
    }

    // ---- leader, defense, resources ----------------------------------------------------
    avatars.push({
      seat,
      position: rail.portrait,
      shield: rail.shield,
      size: { width: LEADER_CARD.width, height: LEADER_CARD.height },
      leader: data.leader.card,
      defense: data.leader.defense,
      active: view.active === seat,
      waiting: view.waitingOn?.seat === seat,
    });
    trays.push({
      seat,
      origin: rail.orbs,
      playPoints: data.resources.playPoints,
      maxPlayPoints: data.resources.maxPlayPoints,
      evolutionPoints: data.resources.evolutionPoints,
      superEvolutionPoints: data.resources.superEvolutionPoints,
    });
  }

  // ---- the one shared resolution zone, at the centre of the table (the spell lands here) ----
  view.resolution.forEach((entry, index, all) => {
    const p = camera.project(centred(index, all.length) * 130, CENTRE);
    cards.push({
      key: cardKey(entry.card.id),
      seat: entry.controller,
      zone: 'resolution',
      ref: entry.card,
      pose: { x: p.x, y: p.y, scale: p.scale * SCALE.resolution * UNIT, rotation: 0 },
      z: Z.resolution + index,
      flat: FLAT.table,
      index,
      ...rest,
    });
  });

  return { viewpoint, cards, piles, avatars, trays, over: view.outcome !== null };
}

/** The design-space box the board lives in, for the scene to centre and scale. */
export const BOARD = DESIGN;
