import { describe, expect, it } from 'vitest';
import type { Presence, SeatPlate } from '../net/presence';
import { tableNotice } from './table-notice';

const names = { 0: 'Alice', 1: 'Bob' } as const;
const plate = (over: Partial<SeatPlate> = {}): SeatPlate => ({
  occupied: true,
  userId: 'u',
  displayName: 'x',
  avatarUrl: null,
  deckName: '',
  connected: true,
  ...over,
});
const presence = (
  status: Presence['status'],
  a: Partial<SeatPlate> = {},
  b: Partial<SeatPlate> = {},
): Presence => ({
  status,
  title: 't',
  seats: [plate(a), plate(b)],
  spectators: 0,
});
const base = { connection: 'live', names, finished: false } as const;

describe('tableNotice', () => {
  it('says nothing when all is well', () => {
    expect(tableNotice({ ...base, presence: presence('playing'), seat: 0 })).toBeNull();
    expect(tableNotice({ ...base, presence: null, seat: 0 })).toBeNull();
  });

  it('reports this browser’s own connection first', () => {
    const away = presence('playing', {}, { connected: false });
    expect(tableNotice({ ...base, connection: 'dropped', presence: away, seat: 0 })?.text).toMatch(
      /Connection lost/,
    );
    expect(tableNotice({ ...base, connection: 'closed', presence: away, seat: 0 })?.leave).toBe(
      true,
    );
  });

  it('does not report a closed connection once the match is over', () => {
    expect(
      tableNotice({
        ...base,
        connection: 'closed',
        finished: true,
        presence: presence('finished'),
        seat: 0,
      }),
    ).toBeNull();
  });

  it('names the opponent who has dropped and how long they have', () => {
    const notice = tableNotice({
      ...base,
      presence: presence('playing', {}, { connected: false }),
      seat: 0,
    });
    expect(notice).toMatchObject({ tone: 'warn', leave: false });
    expect(notice?.text).toBe('Bob disconnected. They have 120 seconds to return.');
  });

  it('does not tell a player that they themselves have dropped', () => {
    expect(
      tableNotice({ ...base, presence: presence('playing', { connected: false }), seat: 0 }),
    ).toBeNull();
  });

  it('tells a spectator about either player', () => {
    const notice = tableNotice({
      ...base,
      presence: presence('playing', { connected: false }),
      seat: null,
    });
    expect(notice?.text).toBe('Alice disconnected. They have 120 seconds to return.');
  });
});
