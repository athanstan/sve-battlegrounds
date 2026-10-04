import { asCardDefId, type CardDefinition } from '@sve/rules';
import { atMainPhase, catalog, populate, spectatorViewOf, viewOf } from '@sve/playmat/testing';
import { describe, expect, it, vi } from 'vitest';
import { CatalogStore } from './catalog-store';
import { definitionsIn } from './view-cards';

const id = asCardDefId;
const def = (name: string) => ({ id: id(name), name }) as unknown as CardDefinition;

describe('definitionsIn', () => {
  const state = atMainPhase('catalog', 2);

  it('lists each definition once, covering leaders, hand, field, EX and piles', () => {
    const view = populate(viewOf(state, 0));
    const ids = definitionsIn(view);
    expect(new Set(ids).size).toBe(ids.length);
    for (const seat of view.seats) {
      expect(ids).toContain(seat.leader.card.def);
      for (const entry of seat.field) expect(ids).toContain(entry.card.def);
      for (const entry of seat.ex) expect(ids).toContain(entry.card.def);
      for (const card of seat.cemetery) expect(ids).toContain(card.def);
    }
    for (const card of view.seats[0].hand.cards ?? []) expect(ids).toContain(card.def);
  });

  it('asks for nothing the viewer is not allowed to see', () => {
    // With both hands closed and the field empty, the only cards a spectator can know are the leaders.
    const closed = definitionsIn(spectatorViewOf(state));
    const view = viewOf(state, 0);
    expect(closed.sort()).toEqual(view.seats.map((seat) => seat.leader.card.def).sort());

    // The same match seen by a player does include their hand.
    expect(definitionsIn(view).length).toBeGreaterThan(closed.length);
  });

  it('resolves against the fixture catalog', () => {
    for (const definition of definitionsIn(populate(viewOf(state, 1))))
      expect(catalog(definition)).toBeDefined();
  });
});

describe('CatalogStore', () => {
  it('fetches what it does not know, once, and answers lookups afterwards', async () => {
    const fetchCards = vi.fn((ids: readonly string[]) => Promise.resolve(ids.map(def)));
    const store = new CatalogStore(fetchCards);
    const heard = vi.fn();
    store.subscribe(heard);

    store.ensure([id('a'), id('b')]);
    store.ensure([id('a'), id('b')]);
    expect(fetchCards).toHaveBeenCalledTimes(1);
    const before = store.snapshot();
    expect(before(id('a'))).toBeUndefined();

    await vi.waitFor(() => expect(store.snapshot()(id('a'))?.name).toBe('a'));
    expect(store.snapshot()).not.toBe(before);
    expect(heard).toHaveBeenCalledTimes(1);

    store.ensure([id('a'), id('c')]);
    expect(fetchCards).toHaveBeenLastCalledWith(['c']);
  });

  it('asks again after a failure, but only when asked to', async () => {
    let fail = true;
    const fetchCards = vi.fn((ids: readonly string[]) =>
      fail ? Promise.reject(new Error('down')) : Promise.resolve(ids.map(def)),
    );
    const store = new CatalogStore(fetchCards);

    store.ensure([id('a')]);
    await vi.waitFor(() => expect(fetchCards).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(fetchCards).toHaveBeenCalledTimes(1);

    fail = false;
    store.ensure([id('a')]);
    await vi.waitFor(() => expect(store.snapshot()(id('a'))).toBeDefined());
    expect(fetchCards).toHaveBeenCalledTimes(2);
  });

  it('does not keep asking for an id the server does not have', async () => {
    const fetchCards = vi.fn(() => Promise.resolve([] as CardDefinition[]));
    const store = new CatalogStore(fetchCards);
    store.ensure([id('ghost')]);
    const before = store.snapshot();
    await vi.waitFor(() => expect(store.snapshot()).not.toBe(before));
    store.ensure([id('ghost')]);
    expect(fetchCards).toHaveBeenCalledTimes(1);
  });
});
