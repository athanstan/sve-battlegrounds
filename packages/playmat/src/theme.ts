import type { CardClass } from '@sve/rules';

/** Design space. The playmat draws at this size and scales to whatever canvas it is given. */
export const DESIGN = { width: 1600, height: 900 } as const;

/**
 * Where the chrome puts things that belong to the table as a whole, in design space: the
 * table's centre line, and the bottom edge of a prompt, which hangs just above the local hand.
 */
export const OVERLAY = { midlineY: 400, promptBottomY: 744 } as const;

/** One card at scale 1, in design pixels. A trading card is 63 x 88 mm. */
export const CARD = { width: 120, height: 168, radius: 9 } as const;

/** Resolution the card textures are baked at, so the largest row (the local hand) stays sharp. */
export const CARD_TEXTURE_RESOLUTION = 3;

export const FONTS = {
  display: "'Cinzel', 'Trajan Pro', Georgia, serif",
  body: "'Inter Variable', Inter, system-ui, sans-serif",
} as const;

/** Faces that must be loaded before text is baked into card textures. */
export const FONT_FACES = [
  "600 20px 'Cinzel'",
  "700 20px 'Cinzel'",
  "500 12px 'Inter Variable'",
] as const;

export const COLOR = {
  stone: 0x1b1d21,
  stoneLight: 0x2a2d33,
  gold: 0xc9a45c,
  goldBright: 0xf0d58c,
  goldDeep: 0x7a5f2b,
  ink: 0x0d0e11,
  parchment: 0xe9e1cf,
  playPoint: 0x8b6cff,
  playPointDim: 0x2b2640,
  evolution: 0xe8b24a,
  superEvolution: 0x6fe0ff,
  shield: 0x2a3140,
  legal: 0x6fb7ff,
  selected: 0xffd36e,
  danger: 0xd2554b,
  buffed: 0x6adf7a,
  carrot: 0xf08a3a,
} as const;

interface ClassStyle {
  readonly name: string;
  /** Frame and accents. */
  readonly main: number;
  /** Deep tone for panels. */
  readonly dark: number;
  /** Bright tone for art gradients and glows. */
  readonly light: number;
}

export const CLASS_STYLE: Readonly<Record<CardClass, ClassStyle>> = {
  neutral: { name: 'Neutral', main: 0x9a9aa3, dark: 0x25262b, light: 0xd6d6de },
  forestcraft: { name: 'Forestcraft', main: 0x5aa469, dark: 0x16271b, light: 0xa8e0a4 },
  swordcraft: { name: 'Swordcraft', main: 0xc9a45c, dark: 0x2a2314, light: 0xf2dca0 },
  runecraft: { name: 'Runecraft', main: 0x5b86d6, dark: 0x16203a, light: 0xa5c4ff },
  dragoncraft: { name: 'Dragoncraft', main: 0xd9803f, dark: 0x30190d, light: 0xffc08a },
  abysscraft: { name: 'Abysscraft', main: 0xb2425b, dark: 0x2a1018, light: 0xff93a8 },
  havencraft: { name: 'Havencraft', main: 0xd8d4c4, dark: 0x2b2a27, light: 0xffffff },
};

/**
 * Where each seat's furniture sits in design space. Opponent above, local below.
 *
 * The left rail holds the leader, its resources and the evolve deck, and nothing else. The right
 * rail holds the deck, with the cemetery and then the banished zone stacked above it (stacked
 * toward the middle of the table for the local seat, and mirrored for the opponent).
 */
export interface RailAnchors {
  readonly portrait: { x: number; y: number };
  readonly shield: { x: number; y: number };
  readonly deck: { x: number; y: number };
  readonly cemetery: { x: number; y: number };
  readonly evolve: { x: number; y: number };
  readonly banished: { x: number; y: number };
  /** Top-left of the orb tray. */
  readonly orbs: { x: number; y: number };
}

/** Where the right rail sits: clear of the hourglass (bottom right) and the chat buttons (top right). */
const RIGHT_RAIL_X = 1360;

export const RAIL = {
  far: {
    portrait: { x: 118, y: 130 },
    shield: { x: 168, y: 178 },
    evolve: { x: 262, y: 110 },
    deck: { x: RIGHT_RAIL_X, y: 100 },
    cemetery: { x: RIGHT_RAIL_X, y: 240 },
    banished: { x: RIGHT_RAIL_X, y: 360 },
    orbs: { x: 60, y: 276 },
  },
  near: {
    portrait: { x: 118, y: 770 },
    shield: { x: 168, y: 818 },
    evolve: { x: 262, y: 790 },
    deck: { x: RIGHT_RAIL_X, y: 800 },
    cemetery: { x: RIGHT_RAIL_X, y: 660 },
    banished: { x: RIGHT_RAIL_X, y: 540 },
    orbs: { x: 60, y: 566 },
  },
} as const satisfies Record<'far' | 'near', RailAnchors>;

export const PORTRAIT_RADIUS = 54;

/**
 * Where the chrome centres each player's name, in design space: just clear of the portrait, on
 * the outer side (above the opponent's, below the local player's).
 */
export const NAMEPLATE = {
  far: { x: RAIL.far.portrait.x, y: RAIL.far.portrait.y - PORTRAIT_RADIUS - 24 },
  near: { x: RAIL.near.portrait.x, y: RAIL.near.portrait.y + PORTRAIT_RADIUS + 40 },
} as const;
