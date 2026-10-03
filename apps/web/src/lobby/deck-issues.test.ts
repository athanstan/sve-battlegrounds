import type { DeckIssue } from '@sve/rules';
import { asCardDefId } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { describeDeckIssue } from './deck-issues';

const card = asCardDefId('x');

describe('describeDeckIssue', () => {
  it('says what is wrong and what would fix it', () => {
    expect(describeDeckIssue({ code: 'mainSize', size: 10, min: 40, max: 50 })).toBe(
      'Main deck has 10 cards; it needs 40 to 50.',
    );
    expect(describeDeckIssue({ code: 'mainSize', size: 39, min: 40, max: 40 })).toContain(
      'it needs 40.',
    );
    expect(describeDeckIssue({ code: 'tooManyCopies', name: 'Fairy', count: 5, limit: 3 })).toBe(
      '5 copies of Fairy; the limit is 3.',
    );
  });

  it('has words for every kind of issue', () => {
    const issues: DeckIssue[] = [
      { code: 'unknownCard', card },
      { code: 'invalidCount', card, count: 0 },
      { code: 'leaderNotLeader', card },
      { code: 'evolveSize', size: 12, max: 10 },
      { code: 'notMainDeckCard', card, reason: 'token' },
      { code: 'notEvolveDeckCard', card },
      { code: 'wrongClass', card, cardClass: 'dragoncraft', leaderClass: 'swordcraft' },
      { code: 'wrongUniverse', card, universe: null, leaderUniverse: 'Umamusume' },
      { code: 'wrongUniverse', card, universe: 'Umamusume', leaderUniverse: null },
      { code: 'universeUnsupported', card, universe: 'Portal' },
    ];
    for (const issue of issues) expect(describeDeckIssue(issue).length).toBeGreaterThan(10);
  });
});
