import {
  CARD_CLASSES,
  KEYWORDS,
  asCardDefId,
  type CardClass,
  type CardDefinition,
  type CardKind,
  type DeckList,
  type Keyword,
  type SpecialType,
} from '@sve/rules';

/**
 * Pure mapping from shadowrates rows to the rules model. No I/O lives here, so every decision
 * about what a printed card *means* for the engine is unit-tested without a database.
 *
 * The shadowrates catalogue is printing-based: every printing is its own row (and therefore its
 * own card id), reprints share a name, and an Evolved card is a row of its own.
 */

/** One `cards` row joined with its craft, as selected by the gateway. */
export interface CardRow {
  readonly id: string;
  readonly name: string;
  /** The printed id ("CP01-LD01EN"); its prefix is the product the card came from. */
  readonly original_card_id: string | null;
  readonly craft: string;
  readonly main_type: string;
  readonly sub_type: string | null;
  readonly cost: number;
  readonly atk: number | null;
  readonly health: number | null;
  readonly traits: string | null;
  readonly abilities: unknown;
  readonly effects: string | null;
  readonly image: string | null;
}

/** One `deck_cards` row joined with the facts that decide which pile the card goes to. */
export interface DeckCardRow {
  readonly deck_id: string;
  readonly card_id: string;
  readonly quantity: number;
  readonly main_type: string;
  readonly sub_type: string | null;
}

const KIND_BY_MAIN_TYPE: Readonly<Record<string, CardKind>> = {
  Leader: 'leader',
  Follower: 'follower',
  Spell: 'spell',
  Amulet: 'amulet',
};

/**
 * `Advanced`, `Equipment`, `Crest` and `Evolution Point` are outside the first slice. Leaving them
 * out of the catalog makes a deck that uses them *illegal* (unknown card) instead of crashing a match.
 */
const SPECIAL_BY_SUB_TYPE: Readonly<Record<string, SpecialType | null>> = {
  '': null,
  Evolved: 'evolved',
  Token: 'token',
};

const CLASS_NAMES: ReadonlySet<string> = new Set(CARD_CLASSES);

/**
 * shadowrates has no universe column, so a universe is recognised from what the data does carry:
 * the Umamusume trait, or the product a printing came from (the crossover set, its starter deck
 * and its EX set, which also hold the universe's leaders, tokens and evolved spells, none of which
 * carry the trait). When shadowrates grows a real field, this function is the only thing to change.
 */
const UMAMUSUME_PRODUCTS: ReadonlySet<string> = new Set(['CP01', 'CSD01', 'ECP01']);

export function universeOf(row: Pick<CardRow, 'original_card_id' | 'traits'>): string | null {
  const product = row.original_card_id?.split('-')[0] ?? '';
  if (UMAMUSUME_PRODUCTS.has(product)) return 'Umamusume';
  return splitTraits(row.traits).includes('Umamusume') ? 'Umamusume' : null;
}

const KEYWORD_BY_SLUG: ReadonlyMap<string, Keyword> = new Map(
  KEYWORDS.map((keyword) => [keyword.toLowerCase(), keyword]),
);

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** shadowrates stores effects as HTML (`<p>`, `<br/>`, inline icons). The engine wants prose. */
export function plainText(html: string | null): string {
  if (!html) return '';
  const text = html
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    // Inline icons carry their meaning in `alt` ("[attack]"); keep that, drop the markup.
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return text === 'None' ? '' : text;
}

/** `"Officer / Commander"`, `"Princess, Fable"` and the placeholder `"-"` all show up. */
export function splitTraits(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*[,/]\s*/)
    .map((trait) => trait.trim())
    .filter((trait) => trait.length > 0 && trait !== '-');
}

/** `["Last Words", "On Evolve", "Earth Rite"]` -> the keywords the engine knows. */
export function keywordsOf(abilities: unknown): Keyword[] {
  if (!Array.isArray(abilities)) return [];
  const found = new Set<Keyword>();
  for (const ability of abilities as unknown[]) {
    if (typeof ability !== 'string') continue;
    const keyword = KEYWORD_BY_SLUG.get(ability.replace(/[^a-z]/gi, '').toLowerCase());
    if (keyword) found.add(keyword);
  }
  return [...found];
}

export interface CardMapping {
  /** Where the browser fetches art from (the server proxies the image bucket). */
  readonly artUrlFor: (image: string) => string;
}

/** `undefined` for printings the first slice does not model. */
export function toCardDefinition(row: CardRow, mapping: CardMapping): CardDefinition | undefined {
  const kind = KIND_BY_MAIN_TYPE[row.main_type];
  const special = SPECIAL_BY_SUB_TYPE[row.sub_type ?? ''];
  const cardClass = row.craft.toLowerCase();
  if (!kind || special === undefined || !CLASS_NAMES.has(cardClass)) return undefined;

  const isFollower = kind === 'follower';
  return {
    id: asCardDefId(row.id),
    name: row.name,
    kind,
    special,
    cardClass: cardClass as CardClass,
    universe: universeOf(row),
    traits: splitTraits(row.traits),
    cost: row.cost,
    attack: isFollower ? row.atk : null,
    defense: isFollower ? row.health : null,
    keywords: keywordsOf(row.abilities),
    text: plainText(row.effects),
    artUrl: row.image ? mapping.artUrlFor(row.image) : null,
  };
}

/** Sorts a deck's rows into the three piles of a `DeckList` (2.4). */
export function toDeckList(rows: readonly DeckCardRow[]): DeckList {
  let leader = '';
  const main = new Map<string, number>();
  const evolve = new Map<string, number>();

  for (const row of rows) {
    if (row.main_type === 'Leader') {
      leader ||= row.card_id;
      continue;
    }
    const pile = row.sub_type === 'Evolved' ? evolve : main;
    pile.set(row.card_id, (pile.get(row.card_id) ?? 0) + row.quantity);
  }

  const entries = (pile: Map<string, number>) =>
    [...pile].map(([card, count]) => ({ card: asCardDefId(card), count }));
  return { leader: asCardDefId(leader), main: entries(main), evolve: entries(evolve) };
}
