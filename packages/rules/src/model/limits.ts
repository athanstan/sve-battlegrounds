/** Starting values and hard limits from the Comprehensive Rules. One place, one citation each. */

/** Leader defense (2.8.3.1, 6.2.1.12). */
export const STARTING_LEADER_DEFENSE = 20;

/** Cards drawn at game start (6.2.1.7). */
export const OPENING_HAND_SIZE = 4;

/** Evolution points at game start: first player 0, second player 3 (6.2.1.10). */
export const STARTING_EVOLUTION_POINTS = { first: 0, second: 3 } as const;

/** Super-evolution points at game start (6.2.1.11). */
export const STARTING_SUPER_EVOLUTION_POINTS = 1;

/** Maximum play points ceiling (3.2.4.1). */
export const MAX_PLAY_POINTS_CEILING = 10;

/** Per-seat zone limits at game start (4.4.4.1, 4.7.3.1, 4.8.3.1). */
export const STARTING_LIMITS = { hand: 7, field: 5, ex: 5 } as const;

/** Deck construction (6.1.1). */
export const DECK_RULES = {
  mainMin: 40,
  mainMax: 50,
  evolveMax: 10,
  copiesPerName: 3,
} as const;
