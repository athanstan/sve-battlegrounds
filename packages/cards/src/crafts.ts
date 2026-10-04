/**
 * Script files live in `<craft>/<card-slug>.ts`. A card's folder is the craft printed on it, so a
 * script is found by what the card *is*, never by the product, universe or deck it came from.
 */
export const CRAFT_DIRS = [
  'neutral',
  'forestcraft',
  'swordcraft',
  'runecraft',
  'dragoncraft',
  'abysscraft',
  'havencraft',
] as const;

export type CraftDir = (typeof CRAFT_DIRS)[number];
