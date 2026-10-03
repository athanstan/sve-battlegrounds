import { textHash, validateDeck } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import dumped from '../fixtures/decks.json' with { type: 'json' };
import { scriptFor } from './registry';
import {
  deckListOf,
  definitionOf,
  fixtureCatalog,
  uniqueFixtureCards,
  FIXTURE_DECKS,
} from './fixture-data';

describe('script coverage', () => {
  it('has a matching script for every unique name+text in decks 940 and 909', () => {
    const missing = uniqueFixtureCards().filter((card) => scriptFor(definitionOf(card)) === null);
    expect(missing.map((card) => card.name)).toEqual([]);
    for (const card of uniqueFixtureCards()) {
      const script = scriptFor(definitionOf(card));
      expect(script?.textHash).toBe(textHash(card.text));
      expect(script?.name).toBe(card.name);
    }
  });

  it('accepts both fixture decks under 6.1', () => {
    const catalog = fixtureCatalog();
    expect(validateDeck(deckListOf('940'), catalog)).toEqual([]);
    expect(validateDeck(deckListOf('909'), catalog)).toEqual([]);
    expect(FIXTURE_DECKS.map((deck) => deck.id)).toEqual(['940', '909']);
  });

  it('keeps the committed dump listing the two decks', () => {
    expect(dumped.decks.map((deck) => deck.id)).toEqual(['940', '909']);
    expect(dumped.decks.map((deck) => deck.name)).toEqual(['On Curve All Day', 'daiwa vodka 2026']);
    const dumpedNames = dumped.decks.flatMap((deck) =>
      'cards' in deck && Array.isArray(deck.cards)
        ? deck.cards.map((card: { name: string }) => card.name)
        : [],
    );
    if (dumpedNames.length > 0) {
      const fixtureNames = uniqueFixtureCards().map((card) => card.name);
      expect(dumpedNames.sort()).toEqual(fixtureNames.sort());
    }
  });
});
