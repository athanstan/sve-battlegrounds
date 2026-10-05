import { asCardDefId, type CardCatalog, type CardDefinition, type DeckList } from '@sve/rules';
import decks from '../fixtures/decks.json' with { type: 'json' };
import { fullCatalog } from './catalog';

/**
 * Playable test decks. A deck here is only printing ids and counts; every fact about a card comes
 * from the catalog (`fixtures/cards.json`). That is the same split the live system has: the
 * catalog is public and shared, a deck belongs to a player and will come from their shadowshowdown
 * account instead of from this file.
 */

export interface FixtureCard extends CardDefinition {
  readonly count: number;
}

export interface FixtureDeck {
  readonly id: string;
  readonly name: string;
  readonly cards: readonly FixtureCard[];
}

function build(): readonly FixtureDeck[] {
  const catalog = fullCatalog();
  return decks.decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    cards: deck.cards.map((entry) => {
      const def = catalog(asCardDefId(entry.id));
      if (!def)
        throw new Error(`Deck ${deck.id} lists card #${entry.id}, which is not in the catalog`);
      return { ...def, count: entry.count };
    }),
  }));
}

let cached: readonly FixtureDeck[] | undefined;

export function fixtureDecks(): readonly FixtureDeck[] {
  cached ??= build();
  return cached;
}

export function definitionOf(card: FixtureCard): CardDefinition {
  const { count: _count, ...definition } = card;
  return definition;
}

/** Every printing of the catalog, so a deck of any card in the database validates. */
export function fixtureCatalog(): CardCatalog {
  return fullCatalog();
}

export function deckListOf(deckId: string): DeckList {
  const deck = fixtureDecks().find((entry) => entry.id === deckId);
  if (!deck) throw new Error(`Unknown fixture deck ${deckId}`);
  const leader = deck.cards.find((card) => card.kind === 'leader');
  if (!leader) throw new Error(`Deck ${deckId} has no leader`);
  return {
    leader: leader.id,
    main: deck.cards
      .filter(
        (card) => card.kind !== 'leader' && card.special !== 'evolved' && card.special !== 'advanced',
      )
      .map((card) => ({ card: card.id, count: card.count })),
    evolve: deck.cards
      .filter((card) => card.special === 'evolved' || card.special === 'advanced')
      .map((card) => ({ card: card.id, count: card.count })),
  };
}

/** One printing per card key across the fixture decks. */
export function uniqueFixtureCards(): FixtureCard[] {
  const seen = new Set<string>();
  const out: FixtureCard[] = [];
  for (const deck of fixtureDecks()) {
    for (const card of deck.cards) {
      if (seen.has(card.key)) continue;
      seen.add(card.key);
      out.push(card);
    }
  }
  return out;
}
