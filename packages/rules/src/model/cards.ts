import type { CardDefId } from './ids';

/** Classes (2.2). Portalcraft is a universe-style deck, not a class. */
export const CARD_CLASSES = [
  'neutral',
  'forestcraft',
  'swordcraft',
  'runecraft',
  'dragoncraft',
  'abysscraft',
  'havencraft',
] as const;
export type CardClass = (typeof CARD_CLASSES)[number];

/** Primary card types in the first slice (2.3.2). */
export type CardKind = 'leader' | 'follower' | 'spell' | 'amulet';

/** Special types (2.3.3.1). Advanced cards are not part of the first slice. */
export type SpecialType = 'evolved' | 'token';

/** First keyword set (12). Keywords expand into abilities; icons are drawn for the passive ones. */
export const KEYWORDS = [
  'fanfare',
  'lastWords',
  'onEvolve',
  'onSuperEvolve',
  'strike',
  'ward',
  'storm',
  'rush',
  'assail',
  'intimidate',
  'drain',
  'bane',
  'aura',
  'quick',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

/**
 * A card definition is data, never script (card text is displayed; abilities are
 * attached by the ability system when the play pipeline lands).
 */
export interface CardDefinition {
  readonly id: CardDefId;
  readonly name: string;
  readonly kind: CardKind;
  readonly special: SpecialType | null;
  readonly cardClass: CardClass;
  /** Universe cards are outside the first slice; decks containing them are rejected. */
  readonly universe: string | null;
  readonly traits: readonly string[];
  /** Printed play-point cost (2.5). Leaders have 0. */
  readonly cost: number;
  /** Followers only. */
  readonly attack: number | null;
  /** Followers only. Leaders start at 20 regardless (2.8.3.1). */
  readonly defense: number | null;
  readonly keywords: readonly Keyword[];
  readonly text: string;
  readonly artUrl: string | null;
  /** Set by the server when a matching script is pinned; omitted in tests. */
  readonly scripted?: boolean;
}

export type CardCatalog = (id: CardDefId) => CardDefinition | undefined;

export const hasKeyword = (def: CardDefinition, keyword: Keyword): boolean =>
  def.keywords.includes(keyword);
