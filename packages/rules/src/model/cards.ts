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

/** Primary card types (2.3.2), plus Equipment and Crest tokens that live in EX or under a follower. */
export type CardKind = 'leader' | 'follower' | 'spell' | 'amulet' | 'equipment' | 'crest';

/** Special types (2.3.3.1). Evolution Point cards are physical-only and never enter the match model. */
export type SpecialType = 'evolved' | 'token' | 'advanced';

/** Keywords (12) and class/universe keywords that print as their own line. */
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
  'overflow',
  'twinDrive',
  'necrocharge',
  'earthRite',
  'combo',
  'spellchain',
  'stack',
  'sanguine',
  'drive',
  'ride',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

const KEYWORD_BY_SLUG: ReadonlyMap<string, Keyword> = new Map(
  KEYWORDS.map((keyword) => [keyword.toLowerCase(), keyword]),
);

const PRINTED_LINE_KEYWORDS = new Set<Keyword>([
  'ward',
  'storm',
  'rush',
  'assail',
  'intimidate',
  'drain',
  'bane',
  'aura',
  'quick',
  'strike',
  'overflow',
  'twinDrive',
  'necrocharge',
  'earthRite',
  'combo',
  'spellchain',
  'stack',
  'sanguine',
  'drive',
  'ride',
]);

/**
 * Keywords written as their own line ("Storm.") or marked as `[quick]` / a leading `quick`.
 * Several keywords may share a line ("Rush. Assail. Bane."). Ability names buried in sentences
 * ("On Evolve - …") are ignored.
 */
export function keywordsFromText(text: string): Keyword[] {
  const found = new Set<Keyword>();
  if (/\[quick\]/i.test(text) || /^\s*quick\b/im.test(text)) found.add('quick');
  for (const line of text.split('\n')) {
    for (const part of line.split(/[.,]/)) {
      const slug = part.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!slug) continue;
      const keyword = KEYWORD_BY_SLUG.get(slug);
      if (keyword && PRINTED_LINE_KEYWORDS.has(keyword)) found.add(keyword);
    }
  }
  return KEYWORDS.filter((keyword) => found.has(keyword));
}

/**
 * A stable identity for scripts and logs. Printed names stay as they are: a "corresponding"
 * evolve card is still the one that shares a name (5.16.1.1.1). The key tells base, evolved,
 * token and double-faced faces apart when those names collide.
 *
 *   amataz-reverse-blader
 *   amataz-reverse-blader@evolved
 *   fortuna-regina@evolved#a
 *   eris@leader                  (a leader shares its name with the follower it is drawn from)
 */
export function cardKey(
  name: string,
  special: SpecialType | null = null,
  originalCardId: string | null = null,
  kind: CardKind | null = null,
): string {
  const slug = slugify(name);
  const suffix = special ? `@${special}` : '';
  const leader = kind === 'leader' ? '@leader' : '';
  const face = faceMark(originalCardId);
  return `${slug}${leader}${suffix}${face}`;
}

function slugify(name: string): string {
  const ascii = name
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'card';
}

/** Double-faced printings use a/b collector suffixes (CP02-SP09aEN). They stay two cards. */
function faceMark(originalCardId: string | null): string {
  if (!originalCardId) return '';
  const match = /([ab])EN$/i.exec(originalCardId);
  const face = match?.[1];
  return face ? `#${face.toLowerCase()}` : '';
}

/**
 * A card definition is data, never script (card text is displayed; abilities are
 * attached by the ability system when the play pipeline lands).
 */
export interface CardDefinition {
  readonly id: CardDefId;
  /** Stable identity for scripts; reprints of the same face share this. */
  readonly key: string;
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
  /**
   * Copy cap for this name in a pile (6.1.1.4). Missing means the default of 3.
   * Evolved Carrot spells print "up to 10".
   */
  readonly copyLimit?: number;
}

export type CardCatalog = (id: CardDefId) => CardDefinition | undefined;

export const hasKeyword = (def: CardDefinition, keyword: Keyword): boolean =>
  def.keywords.includes(keyword);
