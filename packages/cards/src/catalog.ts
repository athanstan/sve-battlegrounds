import snapshot from '../fixtures/cards.json' with { type: 'json' };
import {
  asCardDefId,
  textHash,
  type CardCatalog,
  type CardClass,
  type CardDefinition,
  type CardKind,
  type Keyword,
  type SpecialType,
} from '@sve/rules';

/**
 * The card catalog: every distinct card of the shadowrates database, cached as JSON so scripts can
 * be written (and tested) without a database and without any deck.
 *
 * It is a snapshot of an upstream source, never a source of truth. `pnpm dump:cards` rewrites it
 * from shadowrates today; once shadowshowdown.com ships `GET /api/v1/cards?game=sve` the same
 * `CatalogInput` rows come from that endpoint instead and nothing below changes.
 *
 * Shape: one entry per card *identity* (`cardKey`), holding the facts every printing shares, plus
 * each printing (a row of its own upstream: reprints, alt markup) with the id decks refer to.
 */

/** Facts a printing may override when it differs from the card's shared facts. */
export interface CatalogFacts {
  readonly kind: CardKind;
  readonly special: SpecialType | null;
  readonly cardClass: CardClass;
  readonly universe: string | null;
  readonly traits: readonly string[];
  readonly cost: number;
  readonly attack: number | null;
  readonly defense: number | null;
  readonly keywords: readonly Keyword[];
  readonly copyLimit?: number;
}

export interface CatalogPrinting {
  /** Upstream id: what a deck row points at. */
  readonly id: string;
  /** Printed id ("CP01-LD01EN"). */
  readonly originalCardId: string | null;
  readonly text: string;
  /** Only the facts that differ from the card's. */
  readonly facts?: Partial<CatalogFacts>;
}

export interface CatalogCard extends CatalogFacts {
  readonly key: string;
  readonly name: string;
  /** The first printing is the primary one: scripts are written against its text. */
  readonly printings: readonly CatalogPrinting[];
}

export interface CatalogFile {
  readonly source: string;
  readonly cards: readonly CatalogCard[];
}

/** One upstream printing, already mapped to the rules model. */
export interface CatalogInput {
  readonly definition: CardDefinition;
  readonly originalCardId: string | null;
}

const FACT_KEYS = [
  'kind',
  'special',
  'cardClass',
  'universe',
  'traits',
  'cost',
  'attack',
  'defense',
  'keywords',
  'copyLimit',
] as const satisfies readonly (keyof CatalogFacts)[];

const CRAFT_ORDER: readonly CardClass[] = [
  'neutral',
  'forestcraft',
  'swordcraft',
  'runecraft',
  'dragoncraft',
  'abysscraft',
  'havencraft',
];

/**
 * Printed text with markup, punctuation, case and reminder text removed: two printings that agree
 * on this say the same thing. Reprints differ only by icon markup ("[act]" vs "act"), by line
 * wrapping, by reminder text in parentheses and by a handful of house-style words; a mode list
 * such as "(1) Draw a card." is not reminder text and is kept.
 */
export function canonicalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\((?!\d)[^)]*\)/g, ' ')
    .replace(/\bof the following\b/g, ' ')
    .replace(/\bthis (?:card|follower|amulet|spell)\b/g, 'this')
    .replace(/\bchoose 1\b/g, 'choose one')
    .replace(/\bplace\b/g, 'put')
    .replace(/\bplay points?\b/g, ' ')
    .replace(/\bmax(?:imum)?\b/g, 'max')
    .replace(/\bshuffle (?:your )?deck\b/g, 'shuffle')
    .replace(/[^a-z0-9]+/g, '');
}

function factsOf(def: CardDefinition): CatalogFacts {
  return {
    kind: def.kind,
    special: def.special,
    cardClass: def.cardClass,
    universe: def.universe,
    traits: def.traits,
    cost: def.cost,
    attack: def.attack,
    defense: def.defense,
    keywords: def.keywords,
    ...(def.copyLimit !== undefined ? { copyLimit: def.copyLimit } : {}),
  };
}

function sameFact(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function overridesOf(base: CatalogFacts, facts: CatalogFacts): Partial<CatalogFacts> {
  const diff: Record<string, unknown> = {};
  for (const key of FACT_KEYS) {
    if (!sameFact(base[key], facts[key])) diff[key] = facts[key] ?? null;
  }
  return diff;
}

function numericId(id: string): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Groups upstream printings by card identity. Deterministic: the same input in any order gives
 * the same catalog, so a re-dump only shows real upstream changes in review.
 *
 * The primary printing is the lowest id of the largest group of printings that say the same thing
 * (see `canonicalText`), so one odd reprint can never become the text scripts are pinned to.
 */
export function buildCatalog(inputs: readonly CatalogInput[]): CatalogCard[] {
  const byKey = new Map<string, CatalogInput[]>();
  for (const input of inputs) {
    const list = byKey.get(input.definition.key) ?? [];
    list.push(input);
    byKey.set(input.definition.key, list);
  }

  const cards: CatalogCard[] = [];
  for (const [key, group] of byKey) {
    const sorted = [...group].sort(
      (a, b) => numericId(a.definition.id) - numericId(b.definition.id),
    );
    const sizes = new Map<string, number>();
    for (const input of sorted) {
      const canon = canonicalText(input.definition.text);
      sizes.set(canon, (sizes.get(canon) ?? 0) + 1);
    }
    const winner = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const primary =
      sorted.find((input) => canonicalText(input.definition.text) === winner) ?? sorted[0];
    if (!primary) continue;
    const ordered = [primary, ...sorted.filter((input) => input !== primary)];
    const base = factsOf(primary.definition);

    cards.push({
      key,
      name: primary.definition.name,
      ...base,
      printings: ordered.map((input) => {
        const diff = overridesOf(base, factsOf(input.definition));
        return {
          id: input.definition.id,
          originalCardId: input.originalCardId,
          text: input.definition.text,
          ...(Object.keys(diff).length > 0 ? { facts: diff } : {}),
        };
      }),
    });
  }

  return cards.sort(
    (a, b) =>
      CRAFT_ORDER.indexOf(a.cardClass) - CRAFT_ORDER.indexOf(b.cardClass) ||
      a.name.localeCompare(b.name) ||
      a.key.localeCompare(b.key),
  );
}

/** One JSON object per line: a re-dump produces a minimal, reviewable diff. */
export function serializeCatalog(file: CatalogFile): string {
  const lines = file.cards.map((card) => `    ${JSON.stringify(card)}`);
  return `{\n  "source": ${JSON.stringify(file.source)},\n  "cards": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export function parseCatalog(raw: string): CatalogFile {
  const parsed = JSON.parse(raw) as CatalogFile;
  if (!Array.isArray(parsed.cards)) throw new Error('Card catalog has no "cards" array');
  return parsed;
}

export function definitionOfPrinting(card: CatalogCard, printing: CatalogPrinting): CardDefinition {
  const { key, name, printings: _printings, ...shared } = card;
  const { copyLimit, ...facts } = { ...shared, ...printing.facts } as CatalogFacts & {
    copyLimit?: number | null;
  };
  return {
    id: asCardDefId(printing.id),
    key,
    name,
    ...facts,
    text: printing.text,
    artUrl: null,
    ...(typeof copyLimit === 'number' ? { copyLimit } : {}),
  };
}

/** Printings whose text means the same as the primary one: a script covers all of them. */
export function equivalentTexts(card: CatalogCard): readonly string[] {
  const canon = canonicalText(card.printings[0]?.text ?? '');
  return [
    ...new Set(
      card.printings
        .filter((printing) => canonicalText(printing.text) === canon)
        .map((printing) => printing.text),
    ),
  ];
}

/** Printings whose text differs from the primary one beyond markup. A script does not cover these. */
export function divergentPrintings(card: CatalogCard): readonly CatalogPrinting[] {
  const canon = canonicalText(card.printings[0]?.text ?? '');
  return card.printings.filter((printing) => canonicalText(printing.text) !== canon);
}

export function primaryText(card: CatalogCard): string {
  return card.printings[0]?.text ?? '';
}

export function hashesCovering(card: CatalogCard): readonly string[] {
  return [...new Set(equivalentTexts(card).map((text) => textHash(text)))];
}

// --- the committed snapshot ---------------------------------------------------------------

let cache: CatalogIndex | undefined;

export interface CatalogIndex {
  readonly source: string;
  readonly cards: readonly CatalogCard[];
  readonly byKey: ReadonlyMap<string, CatalogCard>;
  readonly byPrintingId: ReadonlyMap<string, { card: CatalogCard; printing: CatalogPrinting }>;
}

export function indexCatalog(file: CatalogFile): CatalogIndex {
  const byKey = new Map(file.cards.map((card) => [card.key, card]));
  const byPrintingId = new Map<string, { card: CatalogCard; printing: CatalogPrinting }>();
  for (const card of file.cards) {
    for (const printing of card.printings) byPrintingId.set(printing.id, { card, printing });
  }
  return { source: file.source, cards: file.cards, byKey, byPrintingId };
}

/** Lazy: a module that only needs scripts should not parse the whole catalog at import time. */
export function catalogIndex(): CatalogIndex {
  cache ??= indexCatalog(snapshot as unknown as CatalogFile);
  return cache;
}

export function catalogCard(key: string): CatalogCard | undefined {
  return catalogIndex().byKey.get(key);
}

/** The whole catalog as a rules `CardCatalog`, resolved by printing id. */
export function fullCatalog(): CardCatalog {
  const index = catalogIndex();
  const memo = new Map<string, CardDefinition>();
  return (id) => {
    const hit = memo.get(id);
    if (hit) return hit;
    const found = index.byPrintingId.get(id);
    if (!found) return undefined;
    const def = definitionOfPrinting(found.card, found.printing);
    memo.set(id, def);
    return def;
  };
}
