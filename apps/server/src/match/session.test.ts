import { foldView, type CardCatalog, type MatchView } from '@sve/rules';
import { createFixtureGateway, fixtureTokenFor } from '@sve/shadowshowdown/fixture';
import { beforeAll, describe, expect, it } from 'vitest';
import { MatchSession, type SeatClaim } from './session';

let catalog: CardCatalog;
let alice: SeatClaim;
let bob: SeatClaim;

beforeAll(async () => {
  const gateway = createFixtureGateway();
  catalog = await gateway.catalog();
  const claimFor = async (id: string, deckId: string): Promise<SeatClaim> => {
    const token = fixtureTokenFor(id);
    const [user, deck] = await Promise.all([
      gateway.authenticate(token),
      gateway.getDeck(token, deckId),
    ]);
    if (!user || !deck) throw new Error('fixture missing');
    return { user, deckName: deck.name, deck: deck.list };
  };
  alice = await claimFor('alice', 'alice-sword');
  bob = await claimFor('bob', 'bob-forest');
});

const newSession = (spectators: 'closed' | 'hands' = 'closed') =>
  new MatchSession({ spectators, newSeed: () => 'fixed-seed' });

function seated(spectators: 'closed' | 'hands' = 'closed') {
  const session = newSession(spectators);
  session.claim(alice);
  session.claim(bob);
  return session;
}

describe('seating', () => {
  it('gives out seats in order and refuses a third', () => {
    const session = newSession();
    expect(session.claim(alice)).toEqual({ ok: true, seat: 0 });
    expect(session.isFull).toBe(false);
    expect(session.claim(bob)).toEqual({ ok: true, seat: 1 });
    expect(session.isFull).toBe(true);
    const carol = { ...alice, user: { ...alice.user, id: 'carol' } };
    expect(session.claim(carol)).toEqual({ ok: false, reason: 'seatTaken' });
  });

  it('never seats one person twice', () => {
    const session = newSession();
    session.claim(alice);
    expect(session.claim(alice)).toEqual({ ok: false, reason: 'alreadySeated' });
    expect(session.seatOf('alice')).toBe(0);
    expect(session.seatOf('nobody')).toBeNull();
  });

  it('lets a seat be given up only before the match exists', () => {
    const session = newSession();
    session.claim(alice);
    session.vacate(0);
    expect(session.claim(bob)).toEqual({ ok: true, seat: 0 });
    session.claim(alice);
    session.start(catalog);
    expect(() => session.vacate(0)).toThrow(/started/);
    expect(session.claim({ ...alice, user: { ...alice.user, id: 'late' } })).toMatchObject({
      ok: false,
    });
  });
});

describe('starting', () => {
  it('needs both seats and happens once', () => {
    const lonely = newSession();
    lonely.claim(alice);
    expect(() => lonely.start(catalog)).toThrow(/Both seats/);

    const session = seated();
    expect(session.status).toBe('waiting');
    const delivery = session.start(catalog);
    expect(session.status).toBe('playing');
    expect(delivery.fromSeq).toBe(0);
    expect(delivery.toSeq).toBe(session.state?.seq);
    expect(delivery.events[0]?.type).toBe('matchCreated');
    expect(() => session.start(catalog)).toThrow(/already started/);
  });

  it('plays the same match for the same seed', () => {
    const a = seated();
    const b = seated();
    expect(a.start(catalog).events).toEqual(b.start(catalog).events);
  });

  it('answers before the match exists with noMatch, and snapshots with nothing', () => {
    const session = seated();
    expect(session.submit(0, { type: 'concede' })).toEqual({ ok: false, code: 'noMatch' });
    expect(session.snapshotFor({ role: 'spectator' })).toBeNull();
  });
});

describe('submitting intents', () => {
  it('returns a delivery that continues exactly where the last one ended', () => {
    const session = seated();
    const start = session.start(catalog);
    const prompt = session.state?.prompt;
    if (prompt?.kind !== 'turnOrder') throw new Error('expected turn-order prompt');

    const result = session.submit(prompt.seat, {
      type: 'choose',
      promptId: prompt.id,
      choice: { kind: 'turnOrder', goFirst: true },
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.delivery.fromSeq).toBe(start.toSeq);
    expect(result.delivery.toSeq).toBe(session.state?.seq);
    expect(session.log).toHaveLength(session.state?.seq ?? -1);
  });

  it('reports a rejection and leaves the match exactly as it was', () => {
    const session = seated();
    session.start(catalog);
    const before = session.state;
    const prompt = before?.prompt;
    if (!prompt) throw new Error('no prompt');

    const wrongSeat = prompt.seat === 0 ? 1 : 0;
    expect(session.submit(wrongSeat, { type: 'pass', promptId: prompt.id })).toEqual({
      ok: false,
      code: 'notYourPrompt',
    });
    expect(session.state).toBe(before);
  });

  it('ends on a concession', () => {
    const session = seated();
    session.start(catalog);
    const result = session.submit(1, { type: 'concede' });
    expect(result.ok).toBe(true);
    expect(session.status).toBe('finished');
    expect(session.state?.outcome).toEqual({ winner: 0, reason: 'concession' });
  });
});

describe('what each audience is told', () => {
  function played(spectators: 'closed' | 'hands') {
    const session = seated(spectators);
    const start = session.start(catalog);
    const prompt = session.state?.prompt;
    if (prompt?.kind !== 'turnOrder') throw new Error('expected turn order');
    const result = session.submit(prompt.seat, {
      type: 'choose',
      promptId: prompt.id,
      choice: { kind: 'turnOrder', goFirst: true },
    });
    if (!result.ok) throw new Error(result.code);
    return { session, start, next: result.delivery };
  }

  it('rebuilds each audience’s snapshot from its events', () => {
    const { session, start, next } = played('closed');
    for (const audience of [
      { role: 'player', seat: 0 },
      { role: 'player', seat: 1 },
      { role: 'spectator' },
    ] as const) {
      let view: MatchView | null = null;
      for (const delivery of [start, next]) {
        for (const { event } of session.eventsFor(delivery, audience).events)
          view = foldView(view, event);
      }
      expect(view).toEqual(session.snapshotFor(audience)?.view);
    }
  });

  it('numbers envelopes by log position, skipping server-only events', () => {
    const { session, start } = played('closed');
    const { events, fromSeq, toSeq } = session.eventsFor(start, { role: 'spectator' });
    expect(fromSeq).toBe(0);
    expect(toSeq).toBe(start.toSeq);
    expect(events[0]?.seq).toBe(1);
    const seqs = events.map((envelope) => envelope.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(events.length).toBeLessThan(start.events.length); // rngAdvanced / stepChanged are gone
  });

  it('shows closed spectators no hands, and hands-mode spectators both', () => {
    const closed = played('closed').session.snapshotFor({ role: 'spectator' });
    expect(closed?.view.seats.map((seat) => seat.hand.cards)).toEqual([null, null]);

    const open = played('hands').session.snapshotFor({ role: 'spectator' });
    expect(open?.view.seats.map((seat) => seat.hand.cards?.length)).toEqual([4, 4]);
  });
});
