import { ErrorCode } from '@colyseus/core';
import { ColyseusSDK } from '@colyseus/sdk';
import type { ColyseusTestServer } from '@colyseus/testing';
import { JoinError, MATCH_ROOM, MatchMessage } from '@sve/protocol';
import { createFixtureGateway } from '@sve/shadowshowdown/fixture';
import type { ShadowShowdownGateway } from '@sve/shadowshowdown';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../server';
import {
  TestUser,
  listenOn,
  playUntil,
  quiet,
  quoted,
  until,
  wsUrl,
  type TestPlayer,
} from '../testing/test-player';

const PORT = 2570;
const WEB_ORIGIN = 'http://localhost:5173';

/** The fixture shop plus one deck that breaks the 40-card minimum and one that does not exist. */
function gatewayWithShortDeck(): ShadowShowdownGateway {
  const fixture = createFixtureGateway();
  return {
    ...fixture,
    async getDeck(token, deckId) {
      const deck = await fixture.getDeck(token, deckId.replace('-short', '-sword'));
      if (!deck || !deckId.endsWith('-short')) return deck;
      return { ...deck, id: deckId, list: { ...deck.list, main: deck.list.main.slice(0, 5) } };
    },
  };
}

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await listenOn(
    createServer({
      gateway: gatewayWithShortDeck(),
      authConfig: { mode: 'fixture', accounts: [] },
      devLogin: null,
      art: null,
      webOrigin: WEB_ORIGIN,
      newSeed: () => 'integration-seed',
      reconnectSeconds: 1,
      gracefullyShutdown: false,
    }),
    PORT,
  );
});

afterEach(() => colyseus.cleanup());
afterAll(() => colyseus.shutdown());

const user = (id: string) => new TestUser(id, PORT);

/** Alice (seat 0) opens a table, Bob sits opposite, and the match is under way. */
async function startMatch(options: { spectators?: 'closed' | 'hands' } = {}) {
  const alice = await user('alice').create({
    role: 'player',
    deckId: 'alice-sword',
    spectators: options.spectators ?? 'closed',
  });
  const bob = await user('bob').join(alice.room.roomId, { role: 'player', deckId: 'bob-forest' });
  await until(() => alice.view !== null && bob.view !== null);
  return { alice, bob, roomId: alice.room.roomId };
}

const handSize = (player: TestPlayer, seat: 0 | 1) => player.view?.seats[seat].hand.count;

describe('opening a table', () => {
  it('waits for an opponent, then seats both and starts the match', async () => {
    const alice = await user('alice').create({ role: 'player', deckId: 'alice-sword' });
    await until(() => alice.state.status === 'waiting');
    expect(alice.view).toBeNull();
    expect(alice.seatPlate(0).displayName).toBe('Alice');
    expect(alice.seatPlate(1).occupied).toBe(false);

    const bob = await user('bob').join(alice.room.roomId, { role: 'player', deckId: 'bob-forest' });
    await until(() => alice.view !== null && bob.view !== null);

    expect(alice.view?.viewer).toEqual({ kind: 'seat', seat: 0 });
    expect(bob.view?.viewer).toEqual({ kind: 'seat', seat: 1 });
    await until(() => alice.state.status === 'playing' && alice.seatPlate(1).connected === true);
    expect(alice.seatPlate(1).displayName).toBe('Bob');
    expect(alice.seatPlate(1).deckName).toBe('Forestcraft Starter');
  });

  it('shows each player their own hand and only the size of the other', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.waitingOn?.kind === 'main');
    expect(alice.view?.seats[0].hand.cards).toHaveLength(4);
    expect(alice.view?.seats[1].hand).toEqual({ count: 4, cards: null });
    expect(bob.view?.seats[1].hand.cards).toHaveLength(4);
    expect(bob.view?.seats[0].hand).toEqual({ count: 4, cards: null });
  });

  it('asks only the seat the rules are waiting on, and tells everyone who that is', async () => {
    const { alice, bob } = await startMatch();
    const asked = alice.view?.waitingOn;
    expect(asked?.kind).toBe('turnOrder');
    expect(bob.view?.waitingOn).toEqual(asked);
    const [askedPlayer, other] = asked?.seat === 0 ? [alice, bob] : [bob, alice];
    expect(askedPlayer.view?.prompt?.kind).toBe('turnOrder');
    expect(other.view?.prompt).toBeNull();
    expect(alice.snapshots).toBeGreaterThanOrEqual(1);
    expect(bob.snapshots).toBeGreaterThanOrEqual(1);
    expect(alice.gaps).toBe(0);
    expect(bob.gaps).toBe(0);
  });

  it('lets the first player redraw and the second keep', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.waitingOn?.kind === 'mulligan');
    const firstSeat = alice.view?.first ?? 0;
    const firstPlayer = firstSeat === 0 ? alice : bob;
    const secondPlayer = firstSeat === 0 ? bob : alice;
    const firstPrompt = firstPlayer.view?.prompt;
    if (firstPrompt?.kind !== 'mulligan') throw new Error('expected first mulligan');
    firstPlayer.send({
      type: 'choose',
      promptId: firstPrompt.id,
      choice: { kind: 'mulligan', redraw: true },
    });
    await until(() => secondPlayer.view?.prompt?.kind === 'mulligan');
    const secondPrompt = secondPlayer.view?.prompt;
    if (secondPrompt?.kind !== 'mulligan') throw new Error('expected second mulligan');
    secondPlayer.send({
      type: 'choose',
      promptId: secondPrompt.id,
      choice: { kind: 'mulligan', redraw: false },
    });
    await playUntil([alice, bob], () => alice.view?.waitingOn?.kind === 'main');
    expect(handSize(alice, firstSeat)).toBe(4);
    expect(handSize(alice, firstSeat === 0 ? 1 : 0)).toBe(4);
  });
});

describe('playing turns', () => {
  it('runs start phase to end phase, drawing from turn 2 and discarding down to seven', async () => {
    const { alice, bob } = await startMatch();
    const players = [alice, bob];

    // Turn order is chosen by `answerFor`: whoever is asked goes first.
    await playUntil(players, () => alice.view?.turn === 1 && alice.view.waitingOn?.kind === 'main');
    const first = alice.view?.active ?? 0;
    const second = first === 0 ? 1 : 0;
    expect(handSize(alice, first)).toBe(4); // the first player does not draw on turn 1 (3.3.2)
    expect(alice.view?.seats[first].resources.maxPlayPoints).toBe(1);

    await playUntil(players, () => alice.view?.turn === 2 && alice.view.waitingOn?.kind === 'main');
    expect(alice.view?.active).toBe(second);
    expect(handSize(alice, second)).toBe(5);

    // The first player draws on turns 3, 5, 7, 9 and holds eight at the end of turn 9.
    await playUntil(players, () => alice.view?.turn === 10);
    expect(alice.promptKindsSeen).toContain('discard');
    expect(handSize(alice, first)).toBe(7);
    expect(handSize(bob, first)).toBe(7);

    for (const player of players) expect(player.gaps).toBe(0);
  });

  it('turns an illegal answer into a rejection and leaves the match alone', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.waitingOn?.kind === 'main');
    const active = alice.view?.active === 0 ? alice : bob;
    const idle = active === alice ? bob : alice;
    const promptId = active.view?.prompt?.id ?? -1;
    const before = active.seq;

    idle.send({ type: 'pass', promptId });
    await until(() => idle.rejections.length === 1);
    expect(idle.rejections[0]).toEqual({ code: 'notYourPrompt', promptId });

    active.send({ type: 'pass', promptId: promptId - 1 });
    await until(() => active.rejections.length === 1);
    expect(active.rejections[0]?.code).toBe('stalePrompt');

    active.send({ type: 'choose', promptId, choice: { kind: 'mulligan', redraw: true } });
    await until(() => active.rejections.length === 2);
    expect(active.rejections[1]?.code).toBe('invalidAnswer');

    expect(active.seq).toBe(before);
    expect(alice.gaps + bob.gaps).toBe(0);
  });

  it('answers an intent that does not even parse, and keeps the player in the match', async () => {
    const { alice, bob } = await startMatch();
    alice.room.send(MatchMessage.intent, { type: 'dropTable' });
    alice.room.send(MatchMessage.intent, 'pass');
    alice.room.send(MatchMessage.intent, { type: 'pass', promptId: -3 });
    await until(() => alice.rejections.length === 3);
    expect(alice.rejections.map((rejection) => rejection.code)).toEqual([
      'malformed',
      'malformed',
      'malformed',
    ]);

    // Nobody was thrown out, so nobody conceded.
    alice.say('still here');
    await until(() => bob.chat.length === 1);
    expect(bob.view?.outcome).toBeNull();
    expect(alice.leftWith).toBeNull();
  });

  it('resends the whole view on request', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 3);
    await quiet([alice, bob]);
    const before = alice.snapshots;
    const held = alice.view;
    alice.room.send(MatchMessage.resync);
    await until(() => alice.snapshots === before + 1);
    expect(alice.view).toEqual(held);
  });

  it('ends the match when a player concedes', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 2);
    bob.send({ type: 'concede' });
    await until(() => alice.view?.outcome !== null && alice.view?.outcome !== undefined);
    expect(alice.view?.outcome).toEqual({ winner: 0, reason: 'concession' });
    expect(bob.view?.outcome).toEqual(alice.view?.outcome);
    await until(() => alice.state.status === 'finished');
  });
});

describe('who can see what, on the wire', () => {
  /** Ids this player once saw in their hand that the viewer has no business knowing. */
  const leaked = (viewer: TestPlayer, owner: TestPlayer): string[] => {
    const finalView = JSON.stringify(viewer.view);
    const wire = JSON.stringify(viewer.wire);
    return [...owner.handIds].filter(
      (id) => !finalView.includes(quoted(id)) && wire.includes(quoted(id)),
    );
  };

  it('never shows a player the other hand, nor a closed spectator either', async () => {
    const { alice, bob, roomId } = await startMatch();
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null);
    await playUntil([alice, bob], () => alice.view?.turn === 6);
    await until(() => carol.view?.turn === 6);

    expect(carol.view?.viewer).toEqual({ kind: 'spectator', handsVisible: [] });
    expect(carol.view?.seats.map((seat) => seat.hand.cards)).toEqual([null, null]);
    expect(carol.view?.prompt).toBeNull();
    expect(carol.view?.waitingOn).not.toBeNull();

    // Positive control: the search below does find ids on the wire when they were sent.
    expect(alice.handIds.size).toBeGreaterThan(4);
    const ownWire = JSON.stringify(alice.wire);
    for (const id of alice.handIds) expect(ownWire).toContain(quoted(id));
    expect(leaked(bob, alice)).toEqual([]);
    expect(leaked(alice, bob)).toEqual([]);
    expect(leaked(carol, alice)).toEqual([]);
    expect(leaked(carol, bob)).toEqual([]);
    for (const player of [alice, bob, carol]) expect(player.gaps).toBe(0);
  });

  it('shows hands to a spectator only when the host opened them', async () => {
    const { alice, bob, roomId } = await startMatch({ spectators: 'hands' });
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null);
    await playUntil([alice, bob], () => alice.view?.turn === 3);
    await until(() => carol.view?.turn === 3);

    expect(carol.view?.viewer).toEqual({ kind: 'spectator', handsVisible: [0, 1] });
    for (const seat of [0, 1] as const) {
      expect(carol.view?.seats[seat].hand.cards).toHaveLength(
        carol.view?.seats[seat].hand.count ?? -1,
      );
    }
    expect(carol.view?.prompt).toBeNull(); // watching a hand is not holding the prompt
    expect(carol.gaps).toBe(0);
  });

  it('lets a spectator in mid-match and catches them up', async () => {
    const { alice, bob, roomId } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 4);
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null && carol.view.turn >= 4);
    expect(carol.snapshots).toBe(1);
    await playUntil([alice, bob], () => alice.view?.turn === 5);
    await until(() => carol.view?.turn === 5);
    expect(carol.gaps).toBe(0);
    await until(() => alice.state.spectators === 1);
  });

  it('keeps a spectator from playing', async () => {
    const { alice, bob, roomId } = await startMatch();
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null);
    carol.send({ type: 'concede' });
    await until(() => carol.rejections.length === 1);
    expect(carol.rejections[0]?.code).toBe('notSeated');
    expect(alice.view?.outcome).toBeNull();
    expect(bob.view?.outcome).toBeNull();
  });
});

describe('who may join', () => {
  it('turns away a visitor who has not signed in, or whose token is no good', async () => {
    const anonymous = new ColyseusSDK(wsUrl(PORT));
    await expect(anonymous.create(MATCH_ROOM, { role: 'spectator' })).rejects.toMatchObject({
      code: ErrorCode.AUTH_FAILED,
    });

    const forged = new ColyseusSDK(wsUrl(PORT));
    forged.auth.token = 'dev:mallory';
    await expect(forged.create(MATCH_ROOM, { role: 'spectator' })).rejects.toMatchObject({
      code: ErrorCode.AUTH_FAILED,
    });
  });

  it('refuses a deck that is not legal before any seat is held', async () => {
    const mallory = user('alice');
    await expect(mallory.create({ role: 'player', deckId: 'alice-short' })).rejects.toMatchObject({
      code: JoinError.deckIllegal,
    });
    await expect(mallory.create({ role: 'player', deckId: 'alice-short' })).rejects.toThrow(
      /not a legal deck/,
    );
  });

  it('refuses someone else’s deck, a deck that does not exist, and nonsense options', async () => {
    await expect(
      user('alice').create({ role: 'player', deckId: 'bob-sword' }),
    ).rejects.toMatchObject({
      code: JoinError.deckNotFound,
    });
    await expect(user('alice').create({ role: 'player', deckId: 'nope' })).rejects.toMatchObject({
      code: JoinError.deckNotFound,
    });
    await expect(user('alice').create({ role: 'player' } as never)).rejects.toMatchObject({
      code: JoinError.badOptions,
    });
  });

  it('seats a person once, and nobody third', async () => {
    const { alice, roomId } = await startMatch();
    await expect(
      user('carol').join(roomId, { role: 'player', deckId: 'carol-sword' }),
    ).rejects.toMatchObject({ code: JoinError.seatTaken });
    await expect(
      user('alice').join(roomId, { role: 'player', deckId: 'alice-forest' }),
    ).rejects.toMatchObject({ code: JoinError.seatTaken });

    // …and before the match is full, one person still cannot take both chairs.
    const lonely = await user('bob').create({ role: 'player', deckId: 'bob-sword' });
    await expect(
      user('bob').join(lonely.room.roomId, { role: 'player', deckId: 'bob-forest' }),
    ).rejects.toMatchObject({ code: JoinError.alreadySeated });
    expect(alice.view).not.toBeNull();
  });
});

describe('chat', () => {
  it('keeps the table and the gallery apart', async () => {
    const { alice, bob, roomId } = await startMatch();
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null);

    alice.say('good luck');
    carol.say('who is winning?');
    await until(() => carol.chat.length === 2 && alice.chat.length === 1 && bob.chat.length === 1);

    expect(alice.chat.map((line) => line.text)).toEqual(['good luck']);
    expect(bob.chat.map((line) => line.text)).toEqual(['good luck']);
    expect(carol.chat.map((line) => [line.channel, line.text])).toEqual([
      ['table', 'good luck'],
      ['spectators', 'who is winning?'],
    ]);
    expect(carol.chat[1]?.author).toEqual({ userId: 'carol', displayName: 'Carol', seat: null });
    expect(alice.chat[0]?.author).toEqual({ userId: 'alice', displayName: 'Alice', seat: 0 });
  });

  it('never puts chat on the rules log', async () => {
    const { alice, bob } = await startMatch();
    const seq = alice.seq;
    alice.say('hello');
    await until(() => bob.chat.length === 1);
    expect(alice.seq).toBe(seq);
    expect(JSON.stringify(alice.wire)).not.toContain('hello');
  });

  it('gives late arrivals what they are allowed to read', async () => {
    const { alice, bob, roomId } = await startMatch();
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => carol.view !== null);
    carol.say('psst');
    alice.say('gg');
    await until(() => carol.chat.length === 2);

    const dave = await user('bob').join(roomId, { role: 'spectator' });
    await until(() => dave.view !== null);
    expect(dave.chatHistory.map((line) => line.text)).toEqual(['psst', 'gg']);
    expect(bob.chat.map((line) => line.text)).toEqual(['gg']);
  });

  it('drops a flood after the burst allowance', async () => {
    const { alice, bob } = await startMatch();
    for (let n = 0; n < 40; n++) alice.say(`spam ${n}`);
    await until(() => bob.chat.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(bob.chat.length).toBeLessThan(40);
  });
});

describe('leaving and coming back', () => {
  it('holds a dropped player’s seat and brings them back where they were', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 3);
    alice.room.reconnection.minUptime = 0;
    const snapshots = alice.snapshots;

    alice.dropConnection();
    await until(() => bob.seatPlate(0).connected === false);
    expect(bob.view?.outcome).toBeNull();

    await until(() => alice.reconnects === 1 && alice.snapshots === snapshots + 1, 8_000);
    await until(() => bob.seatPlate(0).connected === true);
    expect(alice.view?.viewer).toEqual({ kind: 'seat', seat: 0 });
    expect(alice.view?.seats[0].hand.cards).not.toBeNull();
    expect(alice.view?.turn).toBeGreaterThanOrEqual(3);

    // The match carries on, and nothing was skipped or repeated.
    await playUntil([alice, bob], () => alice.view?.turn === 5 && bob.view?.turn === 5);
    expect(alice.view).toEqual(
      bob.view && {
        ...bob.view,
        viewer: alice.view?.viewer,
        seats: alice.view?.seats,
        prompt: alice.view?.prompt,
      },
    );
    expect(alice.gaps + bob.gaps).toBe(0);
  });

  it('lets a reloaded page pick the seat up again with the reconnection token', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 2);
    const token = alice.room.reconnectionToken;
    alice.room.reconnection.enabled = false; // the old page is gone
    alice.dropConnection();
    await until(() => bob.seatPlate(0).connected === false);

    const reloaded = await user('alice').reconnect(token);
    await until(() => reloaded.view !== null);
    expect(reloaded.view?.viewer).toEqual({ kind: 'seat', seat: 0 });
    expect(reloaded.view?.seats[0].hand.cards).not.toBeNull();
    await until(() => bob.seatPlate(0).connected === true);
    expect(bob.view?.outcome).toBeNull();
  });

  it('concedes for a player who stays away past the window', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 2);
    alice.room.reconnection.enabled = false;
    alice.dropConnection();

    await until(() => bob.view?.outcome !== null && bob.view?.outcome !== undefined, 6_000);
    expect(bob.view?.outcome).toEqual({ winner: 1, reason: 'concession' });
    await until(() => bob.state.status === 'finished');
  });

  it('concedes for a player who walks out', async () => {
    const { alice, bob } = await startMatch();
    await playUntil([alice, bob], () => alice.view?.turn === 2);
    await bob.room.leave();
    await until(() => alice.view?.outcome !== null && alice.view?.outcome !== undefined);
    expect(alice.view?.outcome).toEqual({ winner: 0, reason: 'concession' });
  });

  it('closes a table whose host leaves before anyone sits down', async () => {
    const alice = await user('alice').create({ role: 'player', deckId: 'alice-sword' });
    const roomId = alice.room.roomId;
    await alice.room.leave();
    await until(() => colyseus.getRoomById(roomId) === undefined);
    await expect(user('bob').join(roomId, { role: 'spectator' })).rejects.toThrow();
  });

  it('lets a spectator come and go without touching the match', async () => {
    const { alice, bob, roomId } = await startMatch();
    const carol = await user('carol').join(roomId, { role: 'spectator' });
    await until(() => alice.state.spectators === 1);
    await carol.room.leave();
    await until(() => alice.state.spectators === 0);
    expect(alice.view?.outcome).toBeNull();
    expect(bob.view?.outcome).toBeNull();
  });
});
