import { describe, expect, it } from 'vitest';
import { catalogCard } from './catalog';
import { atomsOfText, census, censusCard, isKeywordOnly, unmatchedAbilitiesOf } from './atoms';

describe('clause census', () => {
  it('reads Viridia Magna as rush, assail, bane plus last words', () => {
    const card = catalogCard('viridia-magna');
    expect(card).toBeDefined();
    const row = censusCard(card!);
    expect(row.atoms).toEqual(expect.arrayContaining(['act.banish', 'act.putField', 'act.evolve']));
    expect(atomsOfText('Rush. Assail. Bane.')).toEqual([]);
  });

  it('treats a Storm line with an evolve cost as keyword-only', () => {
    expect(isKeywordOnly('Storm.\n[evolve] [cost01]: Evolve this follower.')).toBe(true);
    expect(isKeywordOnly('Fanfare: Draw a card.')).toBe(false);
  });

  it('covers the catalog with no unmatched residue', () => {
    const report = census();
    expect(report.cards).toBeGreaterThan(3500);
    expect(report.abilities).toBeGreaterThan(5000);
    const leftover = unmatchedAbilitiesOf();
    expect(leftover, leftover.slice(0, 20).join('\n')).toEqual([]);
    expect(report.unmatchedAbilities).toBe(0);
    expect(report.unsupportedAtoms).toEqual([]);
  });
});
