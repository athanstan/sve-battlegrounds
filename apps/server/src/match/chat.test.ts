import type { ChatAuthor } from '@sve/protocol';
import { describe, expect, it } from 'vitest';
import { ChatLog, channelFor, channelsReadBy, sanitizeChat } from './chat';

const alice: ChatAuthor = { userId: 'alice', displayName: 'Alice', seat: 0 };
const bob: ChatAuthor = { userId: 'bob', displayName: 'Bob', seat: 1 };

describe('sanitizeChat', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizeChat('  good \n\n  game\t!  ')).toBe('good game !');
  });

  it('strips control characters and bidirectional overrides', () => {
    expect(sanitizeChat('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeChat('safe\u202eevil')).toBe('safeevil');
    expect(sanitizeChat('x\u2066y\u2069z')).toBe('xyz');
  });

  it('keeps emoji joiners and ordinary punctuation', () => {
    expect(sanitizeChat('👨‍👩‍👧 <b>hi</b> & bye')).toBe('👨‍👩‍👧 <b>hi</b> & bye');
  });
});

describe('channels', () => {
  it('lets spectators read everything and players read only the table', () => {
    expect(channelFor('player')).toBe('table');
    expect(channelFor('spectator')).toBe('spectators');
    expect(channelsReadBy('player')).toEqual(['table']);
    expect(channelsReadBy('spectator')).toEqual(['table', 'spectators']);
  });
});

describe('ChatLog', () => {
  it('numbers and stamps lines in order', () => {
    let now = 1_000;
    const log = new ChatLog({ now: () => now });
    const first = log.post(alice, 'table', 'hello');
    now = 2_000;
    const second = log.post(bob, 'table', 'hi');
    expect(first).toMatchObject({ ok: true, line: { id: 1, at: 1_000, text: 'hello' } });
    expect(second).toMatchObject({ ok: true, line: { id: 2, at: 2_000 } });
  });

  it('refuses messages that are empty once cleaned', () => {
    const log = new ChatLog();
    expect(log.post(alice, 'table', '  \u200b\n ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('keeps the table and the gallery apart in history', () => {
    const log = new ChatLog();
    log.post(alice, 'table', 'for everyone');
    log.post({ userId: 'carol', displayName: 'Carol', seat: null }, 'spectators', 'psst');
    expect(log.history(channelsReadBy('player')).map((line) => line.text)).toEqual([
      'for everyone',
    ]);
    expect(log.history(channelsReadBy('spectator')).map((line) => line.text)).toEqual([
      'for everyone',
      'psst',
    ]);
  });

  it('drops the oldest lines beyond its capacity', () => {
    let now = 0;
    const log = new ChatLog({ capacity: 3, burst: 100, now: () => now });
    for (let n = 1; n <= 5; n++) {
      now += 10;
      log.post(alice, 'table', `m${n}`);
    }
    expect(log.history(['table']).map((line) => line.text)).toEqual(['m3', 'm4', 'm5']);
  });

  it('throttles a flood per person and lets them back in over time', () => {
    let now = 0;
    const log = new ChatLog({ burst: 3, refillMs: 1_000, now: () => now });
    const send = (author: ChatAuthor) => log.post(author, 'table', 'spam').ok;

    expect([send(alice), send(alice), send(alice), send(alice)]).toEqual([true, true, true, false]);
    expect(send(bob)).toBe(true); // someone else is unaffected

    now = 1_000;
    expect(send(alice)).toBe(true);
    expect(send(alice)).toBe(false);

    now = 100_000;
    expect([send(alice), send(alice), send(alice), send(alice)]).toEqual([true, true, true, false]);
  });
});
