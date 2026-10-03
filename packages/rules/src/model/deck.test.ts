import { describe, expect, it } from 'vitest';
import { asCardDefId } from './ids';
import { validateDeck, type DeckList } from './deck';
import type { CardCatalog, CardDefinition } from './cards';
import { LEADER, WARD_FOLLOWER, legalDeck, testCatalog } from '../testing/support';

const issuesOf = (deck: DeckList) => validateDeck(deck, testCatalog).map((issue) => issue.code);

describe('validateDeck (CR 6.1)', () => {
  it('accepts a legal class deck', () => {
    expect(validateDeck(legalDeck(), testCatalog)).toEqual([]);
  });

  it('requires 40 to 50 main-deck cards', () => {
    const small = { ...legalDeck(), main: legalDeck().main.slice(0, 13) };
    expect(issuesOf(small)).toContain('mainSize');
    const big = {
      ...legalDeck(),
      main: [
        ...legalDeck().main,
        { card: WARD_FOLLOWER, count: 3 },
        { card: asCardDefId('test-sword-only'), count: 3 },
        { card: asCardDefId('test-follower-0'), count: 1 },
        { card: asCardDefId('test-follower-1'), count: 1 },
        { card: asCardDefId('test-follower-2'), count: 1 },
      ],
    };
    expect(issuesOf(big)).toContain('mainSize');
  });

  it('caps copies of a name at three, per deck', () => {
    const deck = legalDeck();
    const issues = validateDeck(
      { ...deck, main: [{ card: deck.main[0]!.card, count: 4 }, ...deck.main.slice(1)] },
      testCatalog,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'tooManyCopies', count: 4, limit: 3 }),
    );
  });

  it('allows the evolved copy to share its base card name', () => {
    // Test Follower 0 appears three times in main and once evolved: separate decks, separate caps.
    expect(validateDeck(legalDeck(), testCatalog)).toEqual([]);
  });

  it('rejects cards of another class', () => {
    const deck = legalDeck();
    const wrong = {
      ...deck,
      main: [...deck.main.slice(0, 13), { card: asCardDefId('test-forest-only'), count: 3 }],
    };
    expect(issuesOf(wrong)).toContain('wrongClass');
  });

  it('keeps leader and evolved cards out of the main deck and others out of the evolve deck', () => {
    const deck = legalDeck();
    expect(
      issuesOf({
        ...deck,
        main: [...deck.main, { card: asCardDefId('test-evolved-0'), count: 1 }],
      }),
    ).toContain('notMainDeckCard');
    expect(
      issuesOf({ ...deck, evolve: [{ card: asCardDefId('test-follower-0'), count: 1 }] }),
    ).toContain('notEvolveDeckCard');
  });

  it('limits the evolve deck to ten', () => {
    const deck = legalDeck();
    expect(
      issuesOf({
        ...deck,
        evolve: [
          { card: asCardDefId('test-evolved-0'), count: 3 },
          { card: asCardDefId('test-evolved-1'), count: 3 },
          { card: asCardDefId('test-evolved-2'), count: 3 },
          { card: asCardDefId('test-evolved-1'), count: 2 },
        ],
      }),
    ).toContain('evolveSize');
  });

  it('requires a real leader card and known cards', () => {
    const deck = legalDeck();
    expect(issuesOf({ ...deck, leader: asCardDefId('test-follower-0') })).toContain(
      'leaderNotLeader',
    );
    expect(issuesOf({ ...deck, leader: asCardDefId('nope') })).toContain('unknownCard');
    expect(
      issuesOf({ ...deck, main: [{ card: asCardDefId('nope'), count: 3 }, ...deck.main] }),
    ).toContain('unknownCard');
  });

  it('rejects non-positive and fractional counts', () => {
    const deck = legalDeck();
    expect(
      issuesOf({ ...deck, main: [{ card: deck.main[0]!.card, count: 0 }, ...deck.main.slice(1)] }),
    ).toContain('invalidCount');
    expect(
      issuesOf({
        ...deck,
        main: [{ card: deck.main[0]!.card, count: 1.5 }, ...deck.main.slice(1)],
      }),
    ).toContain('invalidCount');
  });

  it('reports every problem at once', () => {
    const issues = validateDeck(
      { leader: LEADER, main: [], evolve: [{ card: asCardDefId('nope'), count: 1 }] },
      testCatalog,
    );
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['mainSize', 'unknownCard']),
    );
  });

  describe('universe decks (6.1.1.5.2)', () => {
    // The same deck, with everything but a few Neutral-or-other-class cards made a universe's.
    const inUniverse = (universe: string | null, only?: ReadonlySet<string>): CardCatalog => {
      return (id) => {
        const base = testCatalog(id);
        if (!base) return undefined;
        const member = only ? only.has(base.id) : true;
        return { ...base, universe: member ? universe : null } satisfies CardDefinition;
      };
    };

    it('lets a universe deck mix classes, since classes do not apply to it', () => {
      const deck = legalDeck();
      const mixed = {
        ...deck,
        main: [...deck.main.slice(0, 13), { card: asCardDefId('test-forest-only'), count: 3 }],
      };
      expect(validateDeck(mixed, inUniverse('Umamusume'))).toEqual([]);
    });

    it("rejects a card from outside the leader's universe", () => {
      const deck = legalDeck();
      const catalog = inUniverse('Umamusume', new Set(deck.main.map((entry) => entry.card)));
      const issues = validateDeck(
        { ...deck, main: [...deck.main, { card: WARD_FOLLOWER, count: 1 }] },
        (id) => {
          const def = catalog(id);
          return def && id === deck.leader ? { ...def, universe: 'Umamusume' } : def;
        },
      );
      expect(issues.map((issue) => issue.code)).toContain('wrongUniverse');
    });

    it('rejects a universe card in a class deck', () => {
      const deck = legalDeck();
      const first = new Set([deck.main[0]!.card]);
      expect(issuesOf(deck)).toEqual([]);
      expect(
        validateDeck(deck, inUniverse('Umamusume', first)).map((issue) => issue.code),
      ).toContain('wrongUniverse');
    });

    it('rejects universes the engine cannot run yet', () => {
      expect(validateDeck(legalDeck(), inUniverse('Vanguard')).map((i) => i.code)).toContain(
        'universeUnsupported',
      );
    });
  });
});
