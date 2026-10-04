import { describe, expect, it } from 'vitest';
import { cardKey, keywordsFromText } from './cards';

describe('cardKey', () => {
  it('slugs the printed name and leaves reprints of the same face identical', () => {
    expect(cardKey('Amataz, Reverse Blader')).toBe('amataz-reverse-blader');
    expect(cardKey('Amataz, Reverse Blader', null, 'BP15-003EN')).toBe('amataz-reverse-blader');
    expect(cardKey('Amataz, Reverse Blader', null, 'BP15-SL03EN')).toBe('amataz-reverse-blader');
  });

  it('tells an evolved face apart from its base card of the same name', () => {
    expect(cardKey('Amataz, Reverse Blader', 'evolved')).toBe('amataz-reverse-blader@evolved');
    expect(cardKey('Fairy', 'token')).toBe('fairy@token');
  });

  it('keeps a leader apart from the follower it shares a name with', () => {
    expect(cardKey('Eris', null, 'BP01-LD11EN', 'leader')).toBe('eris@leader');
    expect(cardKey('Eris', null, 'BP01-040EN', 'follower')).toBe('eris');
  });

  it('keeps double-faced printings as two cards, keyed by collector a/b', () => {
    expect(cardKey('Fortuna Regina', 'evolved', 'CP02-SP09aEN')).toBe('fortuna-regina@evolved#a');
    expect(cardKey('Fortuna Regina', 'evolved', 'CP02-SP09bEN')).toBe('fortuna-regina@evolved#b');
  });

  it('folds punctuation and ligatures into a slug', () => {
    expect(cardKey('C.C., Woodland Witch')).toBe('c-c-woodland-witch');
    expect(cardKey('Make! Some! NOISE!')).toBe('make-some-noise');
    expect(cardKey('Lævateinn Dragon')).toBe('laevateinn-dragon');
    expect(cardKey('Matikanetannhauser [Machitan☆Adventure]')).toBe(
      'matikanetannhauser-machitan-adventure',
    );
  });
});

describe('keywordsFromText', () => {
  it('reads a keyword that is its own line, and [quick] in a sentence', () => {
    expect(keywordsFromText('Storm.\nOn Evolve - Draw a card.')).toEqual(['storm']);
    expect(keywordsFromText('[quick]\nDeal 2 damage.')).toEqual(['quick']);
    expect(keywordsFromText('quick\nSelect an enemy follower.')).toEqual(['quick']);
  });

  it('does not treat ability names inside sentences as keywords', () => {
    expect(keywordsFromText('On Evolve - Give this follower Storm.')).toEqual([]);
  });

  it('reads several keywords on one line (Viridia Magna)', () => {
    expect(
      keywordsFromText('Rush. Assail. Bane.\nlastwords Banish a Naterran Great Tree.'),
    ).toEqual(['rush', 'assail', 'bane']);
  });
});
