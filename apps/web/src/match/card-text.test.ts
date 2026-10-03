import { describe, expect, it } from 'vitest';
import { keywordLabel, textLines } from './card-text';

describe('textLines', () => {
  it('turns cost icons into numbers and other icons into tags', () => {
    expect(textLines('[evolve] [cost01]: Evolve this follower.')).toEqual([
      [
        { kind: 'tag', label: 'Evolve' },
        { kind: 'text', text: ' ' },
        { kind: 'cost', amount: 1 },
        { kind: 'text', text: ': Evolve this follower.' },
      ],
    ]);
  });

  it('keeps one entry per printed line and drops blanks', () => {
    expect(textLines('[fanfare] Draw a card.\n\n  Give +1/+0.  ')).toEqual([
      [
        { kind: 'tag', label: 'Fanfare' },
        { kind: 'text', text: ' Draw a card.' },
      ],
      [{ kind: 'text', text: 'Give +1/+0.' }],
    ]);
  });

  it('leaves plain text alone and copes with empty text', () => {
    expect(textLines('Just words.')).toEqual([[{ kind: 'text', text: 'Just words.' }]]);
    expect(textLines('')).toEqual([]);
  });
});

describe('keywordLabel', () => {
  it('spaces camel-cased keywords', () => {
    expect(keywordLabel('lastWords')).toBe('Last Words');
    expect(keywordLabel('ward')).toBe('Ward');
  });
});
