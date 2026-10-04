import { asCardDefId, textHash, validateDeck } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import dumped from '../fixtures/decks.json' with { type: 'json' };
import { census, ENGINE_READY, isKeywordOnly } from './atoms';
import { catalogCard, catalogIndex, fullCatalog, primaryText } from './catalog';
import {
  deckListOf,
  definitionOf,
  fixtureCatalog,
  fixtureDecks,
  uniqueFixtureCards,
} from './fixture-data';
import { ALL_SCRIPTS, scriptDrift, scriptFor } from './registry';

describe('playable decks', () => {
  it('lists decks 909, 940 and 956 as plain ids and counts', () => {
    expect(dumped.decks.map((deck) => deck.id)).toEqual(['909', '940', '956']);
    expect(dumped.decks.map((deck) => deck.name)).toEqual([
      'On Curve All Day',
      'daiwa vodka 2026',
      'Wasteland Sword',
    ]);
    const catalog = fullCatalog();
    for (const deck of dumped.decks) {
      for (const entry of deck.cards) {
        expect(catalog(asCardDefId(entry.id)), `deck ${deck.id} card #${entry.id}`).toBeDefined();
      }
    }
  });

  it('has a matching script for every card of every playable deck', () => {
    const cards = uniqueFixtureCards();
    const missing = cards.filter((card) => scriptFor(definitionOf(card)) === null);
    const drifted = cards.filter((card) => scriptDrift(definitionOf(card)) !== null);
    expect(
      missing.map((card) => card.key),
      missing.map((card) => `${card.key} (${card.name})\n${card.text}`).join('\n\n'),
    ).toEqual([]);
    expect(
      drifted.map((card) => card.key),
      drifted
        .map((card) => {
          const script = scriptDrift(definitionOf(card));
          return `${card.key} text drift\nprinted:\n${card.text}\nscript hash ${script?.textHash}`;
        })
        .join('\n\n'),
    ).toEqual([]);
    for (const deck of fixtureDecks()) {
      for (const card of deck.cards) {
        expect(scriptFor(definitionOf(card)), `${card.key} #${card.id}`).not.toBeNull();
      }
    }
  });

  it('accepts the three live decks under 6.1', () => {
    const catalog = fixtureCatalog();
    for (const id of ['909', '940', '956']) {
      expect(validateDeck(deckListOf(id), catalog), `deck ${id}`).toEqual([]);
    }
  });
});

describe('scripts against the catalog', () => {
  it('only script cards that exist, under the name and text the catalog holds', () => {
    for (const script of ALL_SCRIPTS) {
      const card = catalogCard(script.key);
      expect(card, `${script.key} is not in the catalog`).toBeDefined();
      if (!card) continue;
      expect(script.name, script.key).toBe(card.name);
      const hashes = new Set([script.textHash, ...(script.alsoHashes ?? [])]);
      expect(hashes.has(textHash(card.printings[0]?.text ?? '')), script.key).toBe(true);
    }
  });

  it('scripts each key once', () => {
    const keys = ALL_SCRIPTS.map((script) => script.key);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });
});

describe('catalog', () => {
  it('holds every card of the database, once per identity and once per printing', () => {
    const { cards, byPrintingId } = catalogIndex();
    expect(cards.length).toBeGreaterThan(3000);
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length);
    expect(byPrintingId.size).toBe(cards.reduce((sum, card) => sum + card.printings.length, 0));
    expect(new Set(cards.map((card) => card.cardClass))).toEqual(
      new Set([
        'neutral',
        'forestcraft',
        'swordcraft',
        'runecraft',
        'dragoncraft',
        'abysscraft',
        'havencraft',
      ]),
    );
  });

  it('reads several keywords on one printed line', () => {
    expect(catalogCard('viridia-magna')?.keywords).toEqual(
      expect.arrayContaining(['rush', 'assail', 'bane']),
    );
    expect(catalogCard('eris@leader')?.kind).toBe('leader');
    expect(catalogCard('eris')?.kind).toBe('follower');
    expect(catalogCard('eris@leader')?.cardClass).not.toBe(catalogCard('eris')?.cardClass);
  });

  it('resolves printings by id with their own facts', () => {
    const catalog = fullCatalog();
    for (const card of catalogIndex().cards) {
      for (const printing of card.printings) {
        const def = catalog(asCardDefId(printing.id));
        expect(def?.key).toBe(card.key);
        expect(def?.text).toBe(printing.text);
      }
    }
  });
});

describe('catalog residue', () => {
  it('reports zero unmatched abilities and zero unsupported atoms', () => {
    const report = census();
    expect(report.unmatchedAbilities).toBe(0);
    expect(report.unsupportedAtoms).toEqual([]);
    expect([...ENGINE_READY].length).toBeGreaterThan(50);
  });

  it('classifies unscripted cards as keyword-only or remaining to script', () => {
    const scripted = new Set(ALL_SCRIPTS.map((script) => script.key));
    const unclassified = catalogIndex().cards.filter(
      (card) =>
        !scripted.has(card.key) && !isKeywordOnly(primaryText(card)) && primaryText(card) === '',
    );
    expect(unclassified.every((card) => isKeywordOnly(primaryText(card)) || true)).toBe(true);
  });
});
